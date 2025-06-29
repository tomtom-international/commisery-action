/**
 * Copyright (C) 2022, TomTom (http://tomtom.com).
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as core from "@actions/core";

import { context } from "@actions/github";
import {
  bumpSdkVer,
  bumpSemVer,
  getVersionBumpTypeAndMessages,
  printNonCompliance,
} from "../bump";
import { Configuration } from "../config";
import { getConfig } from "../github";
import {
  IVersionBumpTypeAndMessages,
  ReleaseMode,
  SdkVerBumpType,
  IVersionOutput,
} from "../interfaces";

/**
 * Bump action entrypoint
 * Finds out the current version based on SemVer Git tags, optionally creates a
 * GitHub release or a lightweight Git tag, and sets outputs that can be used in
 * other jobs.
 *
 * This action:
 *  - takes inputs `config`, `version-prefix`, `create-release` and `create-tag`
 *  - sets outputs `current-version` and `next-version`
 *
 * @internal
 */
export async function run(): Promise<void> {
  // Try to download and load configuration
  await getConfig(core.getInput("config"));
  const config = new Configuration(".commisery.yml");

  const { branchName, isBranchAllowedToPublish } =
    checkBranchPublishingPermission(config);

  try {
    const prefix = core.getInput("version-prefix");
    if (prefix !== "") {
      config.versionPrefix = prefix;
    }
    const release = core.getBooleanInput("create-release");
    const tag = core.getBooleanInput("create-tag");
    let releaseMode: ReleaseMode = "none";
    if (release) {
      releaseMode = "release";
    } else if (tag) {
      releaseMode = "tag";
    }

    if (release && tag) {
      core.warning(
        'Defining both inputs "create-release" and "create-tag" as "true" is not needed; ' +
          'a Git tag is implicitly created when using "create-release".'
      );
    }

    core.startGroup("🔍 Finding latest topological tag..");
    const bumpInfo: IVersionBumpTypeAndMessages =
      await getVersionBumpTypeAndMessages(context.sha, config);

    if (!bumpInfo.foundVersion) {
      // We haven't found a (matching) SemVer tag in the commit and tag list
      core.setOutput("current-version", "");
      core.setOutput("next-version", "");
      core.setOutput("bump-metadata", "");
      core.warning(`⚠️ No matching SemVer tags found.`);
      core.endGroup();
      return;
    }

    const currentVersion = bumpInfo.foundVersion.toString();
    core.info(
      `ℹ️ Found ${
        config.versionScheme === "semver" ? "SemVer" : "SdkVer"
      } tag: ${currentVersion}`
    );
    core.setOutput("current-version", currentVersion);
    core.endGroup();

    if (bumpInfo.foundVersion.major <= 0) {
      if (!config.initialDevelopment) {
        core.warning(
          "Enforcing version `1.0.0` as we are no longer in `initial development`."
        );
      } else {
        core.info(
          "This repository is under 'initial development'; breaking changes will bump the `MINOR` version."
        );
      }
    }

    const createChangelog = core.getBooleanInput("create-changelog");
    const releaseTypeInput = core.getInput("release-type");

    // Variable to store the version info from either semver or sdkver bump
    let versionInfo: IVersionOutput | undefined;

    if (config.versionScheme === "semver") {
      if (releaseTypeInput !== "") {
        core.warning(
          "The input value 'release-type' has no effect when using SemVer as the version scheme."
        );
      }
      printNonCompliance(bumpInfo.processedCommits);
      core.info("");

      core.startGroup("🔍 Determining SemVer bump");
      versionInfo = await bumpSemVer(
        config,
        bumpInfo,
        releaseMode,
        branchName,
        context.sha,
        isBranchAllowedToPublish,
        createChangelog
      );
    } else if (config.versionScheme === "sdkver") {
      if (!["rel", "rc", "dev", ""].includes(releaseTypeInput)) {
        throw new Error(
          "The input value 'release-type' must be one of: [rel, rc, dev]"
        );
      }
      const releaseType = (
        releaseTypeInput !== "" ? releaseTypeInput : "dev"
      ) as SdkVerBumpType;
      core.startGroup("🔍 Determining SdkVer bump");
      // For non-release branches, a flow similar to SemVer can be followed,
      // but release branches get linear increments.
      versionInfo = await bumpSdkVer(
        config,
        bumpInfo,
        releaseMode,
        releaseType,
        context.sha,
        branchName,
        isBranchAllowedToPublish,
        createChangelog
      );
    } else {
      throw new Error(
        `Unimplemented 'version-scheme': ${config.versionScheme}`
      );
    }

    core.setOutput("next-version", versionInfo?.bump.to ?? "");
    core.setOutput(
      "bump-metadata",
      versionInfo ? JSON.stringify(versionInfo) : ""
    );
  } catch (ex: unknown) {
    core.startGroup("❌ Exception");
    core.setOutput("next-version", "");
    core.setOutput("bump-metadata", "");
    core.setFailed((ex as Error).message);
    core.endGroup();
  }
}

/**
 * Checks if the current branch is allowed to publish based on the configuration.
 *
 * @param config - The commisery configuration
 * @returns An object containing the branch name and a boolean indicating if the branch is allowed to publish
 * @internal
 */
function checkBranchPublishingPermission(config: Configuration): {
  branchName: string;
  isBranchAllowedToPublish: boolean;
} {
  let isBranchAllowedToPublish = false;
  const branchName = context.ref.replace("refs/heads/", "");

  if (context.ref.startsWith("refs/heads/")) {
    try {
      isBranchAllowedToPublish = new RegExp(config.allowedBranches).test(
        branchName
      );
    } catch (e: unknown) {
      core.startGroup(
        "❌ Configuration error - invalid 'allowed-branches' RegEx"
      );
      core.setFailed((e as Error).message);
      core.endGroup();
    }
    if (!isBranchAllowedToPublish) {
      core.startGroup(`ℹ️ Branch ${branchName} is not allowed to publish`);
      core.info(
        `Only branches that match the following ECMA-262 regular expression` +
          `may publish:\n${config.allowedBranches}`
      );
      core.endGroup();
    }
  }

  return { branchName, isBranchAllowedToPublish };
}
