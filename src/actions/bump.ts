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
    }
  }

  try {
    const prefix = core.getInput("version-prefix");
    if (prefix !== "") {
      config.versionPrefix = prefix;
    }
    const release = core.getBooleanInput("create-release");
    const tag = core.getBooleanInput("create-tag");
    const releaseMode: ReleaseMode = release ? "release" : tag ? "tag" : "none";

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
      core.warning(`⚠️ No matching SemVer tags found.`);
      core.endGroup();
      return;
    } else {
      const currentVersion = bumpInfo.foundVersion.toString();
      core.info(
        `ℹ️ Found ${
          config.versionScheme === "semver" ? "SemVer" : "SdkVer"
        } tag: ${currentVersion}`
      );
      core.setOutput("current-version", currentVersion);
    }
    core.endGroup();

    if (bumpInfo.foundVersion.major <= 0) {
      core.info("");
      core.warning(
        config.initialDevelopment
          ? "This repository is under 'initial development'; breaking changes will bump the `MINOR` version."
          : "Enforcing version `1.0.0` as we are no longer in `initial development`."
      );
    }

    printNonCompliance(bumpInfo.processedCommits);

    const createChangelog = core.getBooleanInput("create-changelog");

    core.info("");
    const releaseTypeInput = core.getInput("release-type");

    if (config.versionScheme === "semver") {
      if (releaseTypeInput !== "") {
        core.warning(
          "The input value 'release-type' has no effect when using SemVer as the version scheme."
        );
      }
      core.startGroup("🔍 Determining SemVer bump");
      await bumpSemVer(
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
      await bumpSdkVer(
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
  } catch (ex: unknown) {
    core.startGroup("❌ Exception");
    core.setFailed((ex as Error).message);
    core.endGroup();
  }
}
