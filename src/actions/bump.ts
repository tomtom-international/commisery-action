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
  getVersionBumpTypeAndMessages,
  bumpDraftRelease,
  printNonCompliance,
  bumpSemVer,
} from "../bump";
import { generateChangelog } from "../changelog";
import { ConventionalCommitMessage } from "../commit";
import { Configuration } from "../config";
import { getConfig, isPullRequestEvent } from "../github";
import { IVersionBumpTypeAndMessages, ReleaseMode } from "../interfaces";
import { SemVer, SemVerType } from "../semver";

/**
 * Bump action entrypoint
 * Finds out the current version based on SemVer Git tags, optionally creates a
 * GitHub release or a lightweight Git tag, and sets outputs that can be used in
 * other jobs.
 *
 * This action:
 *  - takes inputs `config`, `version-prefix`, `create-release` and `create-tag`
 *  - sets outputs `current-version` and `next-version`
 */
async function run(): Promise<void> {
  // Try to download and load configuration
  await getConfig(core.getInput("config"));
  const config = new Configuration(".commisery.yml");

  let isBranchAllowedToPublish = false;

  if (context.ref.startsWith("refs/heads/")) {
    const branchName = context.ref.replace("refs/heads/", "");
    try {
      isBranchAllowedToPublish = new RegExp(config.allowedBranches).test(
        branchName
      );
    } catch (e) {
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
      await getVersionBumpTypeAndMessages(prefix, context.sha, config);

    // TODO SdkVer
    if (!bumpInfo.foundVersion) {
      // We haven't found a (matching) SemVer tag in the commit and tag list
      core.setOutput("current-version", "");
      core.setOutput("next-version", "");
      core.warning(`⚠️ No matching SemVer tags found.`);
      core.endGroup();
      return;
    } else {
      const currentVersion = bumpInfo.foundVersion.toString();
      core.info(`ℹ️ Found SemVer tag: ${currentVersion}`);
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

    core.info("");
    core.startGroup("🔍 Determining bump");
    const bumped = await bumpSemVer(config, bumpInfo, releaseMode, context.sha);
    if (!bumped) {
      if (
        isBranchAllowedToPublish &&
        !isPullRequestEvent() &&
        releaseMode === "release"
      ) {
        // Create/rename draft release
        // TODO: add input to `if` statement above to toggle this functionality
        await bumpDraftRelease(bumpInfo, context.sha);
      } else {
      }
    }
  } catch (ex) {
    core.startGroup("❌ Exception");
    core.setFailed((ex as Error).message);
    core.endGroup();
  }
}

run();

export const exportedForTesting = {
  run,
};
