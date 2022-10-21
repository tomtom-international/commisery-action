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

import { context } from "@actions/github";
import { ConventionalCommitMessage } from "./commit";
import { getAssociatedPullRequests } from "./github";
import { IVersionBumpTypeAndMessages } from "./interfaces";
import { SemVerType } from "./semver";

/**
 * Changelog Configuration entry
 */
interface IChangelogCategory {
  /* Title message to use in the Changelog */
  title: string;
  /* Emoji to display in the Changelog */
  emoji: string;
  /* List of changes associated with this Changelog category */
  changes: string[];
}

/**
 * Returns a default Changelog Configuration mapping
 * SemVer types to a readable element.
 */
function getChangelogConfiguration(): Map<SemVerType, IChangelogCategory> {
  const config = new Map<SemVerType, IChangelogCategory>();
  config.set(SemVerType.MAJOR, {
    title: "Breaking Changes",
    emoji: "warning",
    changes: [],
  });
  config.set(SemVerType.MINOR, {
    title: "New Features",
    emoji: "rocket",
    changes: [],
  });
  config.set(SemVerType.PATCH, {
    title: "Bug Fixes",
    emoji: "bug",
    changes: [],
  });
  config.set(SemVerType.NONE, {
    title: "Other changes",
    emoji: "construction_worker",
    changes: [],
  });

  return config;
}

/**
 * Generates a Pull Request suffix `(#123)` in case this is not yet present
 * in the commit description.
 */
async function getPullRequestSuffix(
  commit: ConventionalCommitMessage
): Promise<string> {
  if (commit.hexsha && !commit.description.match(/\s\(#[0-9]+\)$/)) {
    const pull_requests = await getAssociatedPullRequests(commit.hexsha);

    const pr_references: string[] = [];

    for (const pull_request of pull_requests) {
      pr_references.push(`#${pull_request.number}`);
    }

    if (pr_references.length > 0) {
      return ` (${pr_references.join(", ")})`;
    }
  }

  return "";
}

/**
 * Generates an Issue suffix `(TEST-123, TEST-456)` based on the issue
 * references in the git trailer
 */
function getIssueReferenceSuffix(commit: ConventionalCommitMessage): string {
  const ISSUE_REGEX = new RegExp(`[A-Z]+-[0-9]+`, "g");

  const issue_references: string[] = [];
  for (const footer of commit.footers) {
    const matches = footer.value.matchAll(ISSUE_REGEX);
    for (const match of matches) {
      issue_references.push(match[0]);
    }
  }

  if (issue_references.length > 0) {
    return ` (${issue_references.join(", ")})`;
  }

  return "";
}

/**
 * Returns a pretty-formatted Changelog (markdown) based on the
 * provided Conventional Commit messages.
 */
export async function generateChangelog(
  bump: IVersionBumpTypeAndMessages
): Promise<string> {
  if (bump.foundVersion === null) {
    return "";
  }
  const config: Map<SemVerType, IChangelogCategory> =
    getChangelogConfiguration();

  const { owner, repo } = context.repo;

  for (const commit of bump.messages) {
    let msg = `${commit.description
      .charAt(0)
      .toUpperCase()}${commit.description.slice(1)}`;

    msg += await getPullRequestSuffix(commit);
    msg += getIssueReferenceSuffix(commit);

    if (commit.hexsha) {
      const sha_link = `[${commit.hexsha.slice(
        0,
        6
      )}](https://github.com/${owner}/${repo}/commit/${commit.hexsha})`;
      msg += ` [${sha_link}]`;
    }

    config.get(commit.bump)?.changes.push(msg);
  }

  let changelog_formatted = "## What's changed\n";
  for (const value of config) {
    if (value[1].changes.length > 0) {
      changelog_formatted += `### :${value[1].emoji}: ${value[1].title}\n`;
      for (const msg of value[1].changes) {
        changelog_formatted += `* ${msg}\n`;
      }
    }
  }

  const diff_range = `${bump.foundVersion.to_string()}...${bump.foundVersion
    .bump(bump.requiredBump)
    ?.to_string()}`;
  changelog_formatted += `\n\n*Diff since last release: [${diff_range}](https://github.com/${owner}/${repo}/compare/${diff_range})*`;

  return changelog_formatted;
}
