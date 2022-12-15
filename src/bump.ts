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

import { Configuration } from "./config";

import { getCommitsSince, getLatestTags } from "./github";
import { ConventionalCommitMessage } from "./commit";
import { SemVer, SemVerType } from "./semver";
import {
  ConventionalCommitError,
  FixupCommitError,
  MergeCommitError,
} from "./errors";
import { IVersionBumpTypeAndMessages } from "./interfaces";

const PAGE_SIZE = 100;

/**
 * Returns a SemVer object if:
 *  - the `tagSha` and `commitSha` match
 *  - the `tagName` tag reference is SemVer-compatible
 *  - the `prefix` exactly matches the `tagName`'s prefix (if any),
      or the provided `prefix` is "*"
 *
 * @param prefix Specifies the exact prefix of the tags to be considered,
 *               '*' means "any"
 * @param tagName The tag reference name
 * @param tagSha The tag's SHA1 hash
 * @param commitSha The SHA1 hash to compare to
 *
 * @return {Semver | null} A SemVer object representing the value of `tagName`,
 *                         or `null` if the provided parameters don't match
 */
function getSemVerIfMatches(
  prefix: string,
  tagName: string,
  tagSha: string,
  commitSha: string
): SemVer | null {
  if (commitSha === tagSha) {
    // eslint-disable-next-line func-style
    const dbg = function (tag: string, commit: string, message: string): void {
      core.debug(`Tag '${tag}' on commit '${commit.slice(0, 6)}' ${message}`);
    };
    // If provided, make sure that the prefix matches as well
    const sv: SemVer | null = SemVer.fromString(tagName);
    if (sv) {
      // Asterisk is a special case, meaning 'any prefix'
      if (sv.prefix === prefix || prefix === "*") {
        dbg(tagName, commitSha, "matches prefix");
        return sv;
      }
      dbg(tagName, commitSha, "does not match prefix");
    } else {
      dbg(tagName, commitSha, "is not a SemVer");
    }
  }

  return null;
}

function getMessageAsConventionalCommit(
  commitMessage: string,
  hexsha: string,
  config: Configuration
): ConventionalCommitMessage | null {
  try {
    return new ConventionalCommitMessage(commitMessage, hexsha, config);
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
  return null;
}

/**
 * Determines the highest SemVer bump level based on the provided
 * list of Conventional Commits
 */
export async function getVersionBumpType(
  messages: ConventionalCommitMessage[]
): Promise<SemVerType> {
  let highestBump: SemVerType = SemVerType.NONE;

  for (const message of messages) {
    if (highestBump !== SemVerType.MAJOR) {
      core.debug(
        `Commit type '${message.type}'${
          message.breakingChange ? " (BREAKING)" : ""
        }, has bump type: ${SemVerType[message.bump]}`
      );
      highestBump = message.bump > highestBump ? message.bump : highestBump;
    }
  }

  return highestBump;
}

/**
 * Within the current context, examine the last PAGE_SIZE commits reachable
 * from `context.sha`, as well as the last PAGE_SIZE tags in the repo.
 * Each commit shall be tried to be matched to any of the tags found.
 * The closest tag that is SemVer-compatible and matches the provided `prefix`
 * shall be returned as a SemVer object, and the highest bump type encountered
 * (breaking: major, feat: minor, fix plus `extra_patch_tags`: patch) in the commits
 * _since_ that tag shall be returned.
 *
 * @param prefix Specifies the exact prefix of the tags to be considered,
 *               '*' means "any"
 * @param targetSha The sha on which to start listing commits
 * @param config A Configuration object, which optionally contains a list of
 *               Conventional Commit type tags that, like "fix", should bump the
 *               patch version field.
 *
 * @return {IVersionBumpTypeAndMessages}
                 returns an object containing:
                 - the SemVer object or null if no (acceptable) SemVer was found.
                 - the highest bump encountered, or SemVerType.NONE if [0] is null
                 - list of ConventionalCommitMessage objects up to the found SemVer tag
 */
export async function getVersionBumpTypeAndMessages(
  prefix: string,
  targetSha: string,
  config: Configuration
): Promise<IVersionBumpTypeAndMessages> {
  let semVer: SemVer | null = null;
  const conventionalCommits: ConventionalCommitMessage[] = [];
  const nonConventionalCommits: string[] = [];

  core.debug(`Fetching last ${PAGE_SIZE} tags and commits from ${targetSha}..`);
  const [commits, tags] = await Promise.all([
    getCommitsSince(targetSha, PAGE_SIZE),
    getLatestTags(PAGE_SIZE),
  ]);
  core.debug("Fetch complete");

  commit_loop: for (const commit of commits) {
    // Try and match this commit's hash to a tag
    for (const tag of tags) {
      semVer = getSemVerIfMatches(prefix, tag.name, tag.commitSha, commit.sha);
      if (semVer) {
        break commit_loop;
      }
    }
    core.debug(`Commit ${commit.sha.slice(0, 6)} is not associated with a tag`);

    core.debug(`Examining message: ${commit.commit.message}`);
    const msg = getMessageAsConventionalCommit(
      commit.commit.message,
      commit.sha,
      config
    );

    // Determine the required bump if this is a conventional commit
    if (msg) {
      conventionalCommits.push(msg);
    } else {
      nonConventionalCommits.push(commit.commit.message);
    }
  }
  if (nonConventionalCommits.length > 0) {
    const plural: boolean = nonConventionalCommits.length !== 1;
    core.info(
      `The following commit${plural ? "s were" : " was"} not accepted as ${
        plural ? "Conventional Commits" : " a Conventional Commit"
      }`
    );
    for (const c of nonConventionalCommits) {
      core.info(` - "${c}"`);
    }
  }

  return {
    foundVersion: semVer,
    requiredBump: await getVersionBumpType(conventionalCommits),
    messages: conventionalCommits,
  };
}
