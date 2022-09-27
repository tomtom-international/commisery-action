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

const core = require("@actions/core");
const exec = require("@actions/exec");

import { createRelease, IS_PULLREQUEST_EVENT } from "../github";
import { context, getOctokit } from "@actions/github";

import { ConventionalCommitMessage } from "../commit";
import { SemVer, SemVerType } from "../semver";
import {
  ConventionalCommitError,
  FixupCommitError,
  MergeCommitError,
} from "../errors";

const octokit = getOctokit(core.getInput("token"));

/**
 * Bump action entrypoint
 *
 * This action will:
 *  - get a list of commits reachable from `context.sha`
 *  - get a list of tags in the repo
 *  - match commit- and tag-hashes
 *    - find the nearest commit-tag combo representing a SemVer (with optional prefix)
 *  - go through the list of commits _before_ said tag
 *    - parse them as Conventional Commit messages
 *    - keep track of the highest-order bump by the CC type
 *       (breaking: major, feat: minor, fix: patch)
 *
 *  - bump the found SemVer accordingly
 *  - set `current-version` and `next-version` outputs
 *  - if not running on a `pull_request` event and `create-release` input is not false:
 *    - create a GitHub release (and, implicitly, git tag)
 */
async function run() {
  try {
    const { owner, repo } = context.repo;
    const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
      owner: owner,
      repo: repo,
      sha: context.sha,
    });
    const tags = await octokit.paginate(octokit.rest.repos.listTags, {
      owner: owner,
      repo: repo,
    });
    core.startGroup("🔍 Finding latest topological tag..");

    let latest_semver: SemVer | null = null;
    let bump_type: SemVerType = SemVerType.NONE;
    const prefix = core.getInput("version-prefix");

    commits: for (const commit of commits) {
      // Try and match this commit's sha to a tag
      for (const tag of tags) {
        if (tag.name.startsWith(prefix) && commit.sha === tag.commit.sha) {
          core.debug(
            ` - Tag '${tag.name}' on commit '${commit.sha.slice(
              0,
              6
            )}' matches prefix`
          );
          latest_semver = SemVer.from_string(tag.name);
          if (latest_semver != null) {
            core.info(`ℹ️ Found SemVer tag: ${tag.name}`);
            core.setOutput("current-version", latest_semver.to_string());
            break commits;
          } else {
            core.debug(
              `Commit ${commit.sha.slice(0, 6)} has non-matching tag: "${
                tag.name
              }"`
            );
          }
        }
      }
      core.debug(
        `Commit ${commit.sha.slice(0, 6)} is not associated with a tag`
      );

      // Determine the required bump if this is a Conventional Commit
      if (bump_type !== SemVerType.MAJOR) {
        try {
          core.debug(`Examining message: ${commit.commit.message}`);
          const msg = new ConventionalCommitMessage(commit.commit.message);
          bump_type = msg.bump > bump_type ? msg.bump : bump_type;
          core.debug(
            `After commit type '${msg.type}', bump is: ${SemVerType[bump_type]}`
          );
        } catch (error) {
          // Ignore compliancy errors, but rethrow other errors
          if (
            !(
              error instanceof ConventionalCommitError ||
              error instanceof MergeCommitError ||
              error instanceof FixupCommitError
            )
          ) {
            throw error;
          }
        }
      }
    }

    if (latest_semver == null) {
      // We haven't found a (matching) SemVer tag in the commit and tag list
      core.setOutput("current-version", "");
      core.setOutput("next-version", "");
      core.warning("⚠️ No SemVer-compatible tags found.");
      core.endGroup();
      return;
    }
    core.endGroup();

    core.startGroup("🔍 Determining bump");
    const next_version: SemVer | null = latest_semver.bump(bump_type);
    if (next_version) {
      const nv = next_version.to_string();
      core.info(`ℹ️ Next version: ${nv}`);
      core.setOutput("next-version", nv);
      core.endGroup();

      if (core.getInput("create-release") === "true") {
        if (!IS_PULLREQUEST_EVENT) {
          core.startGroup(`ℹ️ Creating release ${nv}..`);
          createRelease(nv);
        } else {
          core.startGroup("ℹ️ Not creating a release on a pull request event.");
        }
      } else {
        core.startGroup(`ℹ️ Not creating release for ${nv}..`);
      }
    } else {
      core.info("ℹ️ No bump");
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
