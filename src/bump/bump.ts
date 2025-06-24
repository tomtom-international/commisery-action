/**
 * Copyright (C) 2025, TomTom (http://tomtom.com).
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
import { RequestError } from "@octokit/request-error";

import { Configuration } from "../config";
import {
  createRelease,
  createTag,
  getShaForTag,
  isPullRequestEvent,
  updateDraftRelease,
} from "../github";
import {
  ICommit,
  IGitHubRelease,
  IGitTag,
  IValidationResult,
  ReleaseMode,
} from "../interfaces";
import { SemVer } from "../semver";
import { processCommits } from "../validate";

export const RC_PREFIX = "rc";

/**
 * Return the first eight characters of a string.
 *
 * To be used as a shortened version of the 40-character SHA1 version.
 */
export function shortSha(sha: string): string {
  return sha.substring(0, 8);
}

/** Validates a list of commits in a bump context, which differs slightly to
 * pull request validation runs, as some rules need to be disabled.
 */
export function processCommitsForBump(
  commits: ICommit[],
  config: Configuration
): IValidationResult[] {
  // We'll relax certain rules while processing these commits; these are
  // commits/pull request titles that (ideally) have been validated
  // _before_ they were merged, and certain GitHub CI settings may append
  // a reference to the PR number in merge commits.
  const configCopy = config.copy();
  configCopy.setRuleActive("C014", false); // SubjectExceedsLineLengthLimit
  configCopy.setRuleActive("C019", false); // SubjectContainsIssueReference

  return processCommits(commits, configCopy);
}

export async function publishBump(
  nextVersion: SemVer,
  releaseMode: ReleaseMode,
  headSha: string,
  changelog: string,
  isBranchAllowedToPublish: boolean,
  discussionCategoryName?: string,
  updateDraftId?: number
): Promise<{ release?: IGitHubRelease; tag?: IGitTag }> {
  let releaseMetadata: IGitHubRelease | undefined;
  let tagMetadata: IGitTag | undefined;

  const nv = nextVersion.toString();
  core.info(`ℹ️ Next version: ${nv}`);
  core.endGroup();
  if (releaseMode !== "none") {
    if (!isBranchAllowedToPublish) {
      return {};
    }
    if (isPullRequestEvent()) {
      core.startGroup(
        `ℹ️ Not creating ${releaseMode} on a pull request event.`
      );
      core.info(
        "We cannot create a release or tag in a pull request context, due to " +
          "potential parallelism (i.e. races) in pull request builds."
      );
      return {};
    }
    core.startGroup(`ℹ️ Creating ${releaseMode} ${nv}..`);
    try {
      if (releaseMode === "tag") {
        tagMetadata = await createTag(nv, headSha);
      } else {
        // If version is a prerelease, but not an RC, create a draft release
        // If version is an RC, create a GitHub "pre-release"
        const isRc = nextVersion.prerelease.startsWith(RC_PREFIX);
        const isDev = nextVersion.prerelease !== "" && !isRc;
        if (updateDraftId) {
          releaseMetadata = await updateDraftRelease(
            updateDraftId,
            nv,
            nv,
            headSha,
            changelog,
            isDev, // draft
            isRc // prerelease
          );

          if (!releaseMetadata) {
            core.info(
              `Error renaming existing draft release, ` +
                `creating new draft release.`
            );
          }
        }

        if (!releaseMetadata) {
          releaseMetadata = await createRelease(
            nv,
            headSha,
            changelog,
            isDev,
            isRc,
            discussionCategoryName
          );

          // Only set the tag information in case we created a release
          // which implicitly creates a tag (i.e. not applicable for draft-releases).
          if (releaseMetadata) {
            tagMetadata = {
              name: releaseMetadata.name,
              ref: `refs/tags/${releaseMetadata.name}`,
              sha: headSha,
            };
          }
        }
      }
    } catch (ex: unknown) {
      // The most likely failure is a preexisting tag, in which case
      // a RequestError with statuscode 422 will be thrown
      const commit = await getShaForTag(`refs/tags/${nv}`);
      if (ex instanceof RequestError && ex.status === 422 && commit) {
        core.setFailed(
          `Unable to create ${releaseMode}; the tag "${nv}" already exists in the repository, ` +
            `it currently points to ${commit}.\n` +
            "You can find the branch(es) associated with the tag with:\n" +
            `  git fetch -t; git branch --contains ${nv}`
        );
      } else if (ex instanceof RequestError) {
        core.setFailed(
          `Unable to create ${releaseMode} with the name "${nv}" due to ` +
            `HTTP request error (status ${ex.status}):\n${ex.message}`
        );
      } else if (ex instanceof Error) {
        core.setFailed(
          `Unable to create ${releaseMode} with the name "${nv}":\n${ex.message}`
        );
      } else {
        core.setFailed(`Unknown error during ${releaseMode} creation`);
        throw ex;
      }
      core.endGroup();
      return {};
    }
    core.info("Succeeded");
  } else {
    core.startGroup(`ℹ️ Not creating tag or release for ${nv}..`);
    core.info(
      "To create a lightweight Git tag or GitHub release when the version is bumped, run this action with:\n" +
        ' - "create-release" set to "true" to create a GitHub release, or\n' +
        ' - "create-tag" set to "true" for a lightweight Git tag.\n' +
        "Note that setting both options is not needed, since a GitHub release implicitly creates a Git tag."
    );
    return {};
  }

  return {
    release: releaseMetadata,
    tag: tagMetadata,
  };
}
