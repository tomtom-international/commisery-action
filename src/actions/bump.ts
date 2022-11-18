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

import { getVersionBumpTypeAndMessages } from "../bump";
import { generateChangelog } from "../changelog";
import { Configuration } from "../config";
import {
  createRelease,
  createTag,
  getConfig,
  isPullRequestEvent,
} from "../github";
import { IVersionBumpTypeAndMessages } from "../interfaces";
import { SemVer } from "../semver";

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

  const allowedBranchesRegEx = config.allowed_branches;
  const branchName = context.ref.replace("refs/heads/", "");
  let isBranchAllowedToPublish = false;

  if (context.ref.startsWith("refs/heads/")) {
    try {
      isBranchAllowedToPublish = new RegExp(allowedBranchesRegEx).test(
        branchName
      );
      core.info(
        `Regex ${allowedBranchesRegEx} result on ${branchName}: ${isBranchAllowedToPublish}`
      );
    } catch (e) {
      core.startGroup(
        "❌ Configuration error - invalid 'allowed-branches' RegEx"
      );
      core.setFailed((e as Error).message);
      core.endGroup();
    }
  }

  try {
    const prefix = core.getInput("version-prefix");
    const release = core.getBooleanInput("create-release");
    let tag = core.getBooleanInput("create-tag");

    if (release && tag) {
      core.warning(
        'Defining both inputs "create-release" and "create-tag" as "true" is not needed; ' +
          'a Git tag is implicitly created when using "create-release".'
      );
      tag = false;
    }

    core.startGroup("🔍 Finding latest topological tag..");
    const bumpInfo: IVersionBumpTypeAndMessages =
      await getVersionBumpTypeAndMessages(prefix, context.sha, config);

    if (!bumpInfo.foundVersion) {
      // We haven't found a (matching) SemVer tag in the commit and tag list
      core.setOutput("current-version", "");
      core.setOutput("next-version", "");
      core.warning(`⚠️ No matching SemVer tags found.`);
      core.endGroup();
      return;
    } else {
      const currentVersion = bumpInfo.foundVersion.to_string();
      core.info(`ℹ️ Found SemVer tag: ${currentVersion}`);
      core.setOutput("current-version", currentVersion);
    }
    core.endGroup();

    core.startGroup("🔍 Determining bump");
    const nextVersion: SemVer | null = bumpInfo.foundVersion.bump(
      bumpInfo.requiredBump,
      config.initial_development
    );
    if (nextVersion) {
      // Assign Build Metadata
      const build_metadata = core.getInput("build-metadata");
      if (build_metadata) {
        nextVersion.build = build_metadata;
      }

      const nv = nextVersion.to_string();
      core.info(`ℹ️ Next version: ${nv}`);
      core.setOutput("next-version", nv);
      core.endGroup();
      if (release || tag) {
        const relType = tag ? "tag" : "release";
        if (!isBranchAllowedToPublish) {
          core.startGroup(`ℹ️ Branch ${branchName} is not allowed to publish`);
          core.info(
            `Only branches that match the following regex may publish:\n${allowedBranchesRegEx}`
          );
        } else if (isPullRequestEvent()) {
          core.startGroup(
            `ℹ️ Not creating ${relType} on a pull request event.`
          );
          core.info(
            "We cannot create a release or tag in a pull request context, due to " +
              "potential parallelism (i.e. races) in pull request builds."
          );
        } else {
          core.startGroup(`ℹ️ Creating ${relType} ${nv}..`);
          if (tag) {
            createTag(nv, context.sha);
          } else {
            const changelog = await generateChangelog(bumpInfo);
            createRelease(nv, context.sha, changelog);
          }
        }
      } else {
        core.startGroup(`ℹ️ Not creating tag or release for ${nv}..`);
        core.info(
          "To create a lightweight Git tag or GitHub release when the version is bumped, run this action with:\n" +
            ' - "create-release" set to "true" to create a GitHub release, or\n' +
            ' - "create-tag" set to "true" for a lightweight Git tag.\n' +
            "Note that setting both options is not needed, since a GitHub release implicitly creates a Git tag."
        );
      }
    } else {
      core.info("ℹ️ No bump necessary");
      core.setOutput("next-version", "");
    }
    core.endGroup();
  } catch (ex) {
    core.startGroup("❌ Exception");
    core.setFailed((ex as Error).message);
    core.endGroup();
  }
}

run();
