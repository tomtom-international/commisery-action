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
import { getAssociatedPullRequests, getReleaseConfiguration } from "./github";
import { IVersionBumpTypeAndMessages } from "./interfaces";
import * as yaml from "yaml";
import { SemVerType } from "./semver";

/**
 * Exclude pattern, part of the Release Configuration
 */
interface IExcludeConfiguration {
  /* A list of labels that exclude a pull request from appearing in release notes. */
  labels?: string[];
  /* A list of user or bot login handles whose pull requests are to be excluded from release notes. */
  authors?: string[];
}

/**
 * Release Configuration
 */
export interface IReleaseConfiguration {
  changelog: {
    exclude?: IExcludeConfiguration;
    categories: {
      /* Required. The title of a category of changes in release notes. */
      title: string;
      /* Required. Labels that qualify a pull request for this category. Use * as a catch-all for pull requests that didn't match any of the previous categories. */
      labels: string[];
      exclude?: IExcludeConfiguration;
    }[];
  };
}

/**
 * Default Release Configuration
 */
const DEFAULT_CONFIG: IReleaseConfiguration = {
  changelog: {
    categories: [
      {
        title: ":warning: Breaking Changes",
        labels: ["bump:major"],
      },
      {
        title: ":rocket: New Features",
        labels: ["bump:minor"],
      },
      {
        title: ":bug: Bug Fixes",
        labels: ["bump:patch"],
      },
      {
        title: ":construction_worker: Other changes",
        labels: ["*"],
      },
    ],
  },
};

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
  const ISSUE_REGEX = new RegExp(/([A-Z]+-[0-9]+|#[0-9]+)/g);

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
 * Creates an entry in the Changelog based on the provided
 * Conventional Commit message.
 */
async function generateChangelogEntry(
  commit: ConventionalCommitMessage
): Promise<string> {
  const { owner, repo } = context.repo;

  let changelogEntry = `${commit.description
    .charAt(0)
    .toUpperCase()}${commit.description.slice(1)}`;

  changelogEntry += await getPullRequestSuffix(commit);
  changelogEntry += getIssueReferenceSuffix(commit);

  if (commit.hexsha) {
    const sha_link = `[${commit.hexsha.slice(
      0,
      6
    )}](https://github.com/${owner}/${repo}/commit/${commit.hexsha})`;
    changelogEntry += ` [${sha_link}]`;
  }

  return changelogEntry;
}

/**
 * Returns the Changelog configuration;
 *   - The contents of the .github/release.y[a]ml file
 *   - Otherwise, the internal default configuration
 */
export async function getChangelogConfiguration(): Promise<IReleaseConfiguration> {
  const githubReleaseConfig = await getReleaseConfiguration();

  if (githubReleaseConfig.length > 0) {
    const data = yaml.parse(githubReleaseConfig);
    if (data["changelog"] !== undefined) {
      return data;
    }
  }

  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

/**
 * Checks whether the provided labels/authors are part of the reference set
 */
function hasConfigurationElement(
  compare: IExcludeConfiguration,
  reference?: IExcludeConfiguration
): boolean {
  if (compare.authors) {
    for (const item of compare.authors) {
      if (reference && reference.authors && reference.authors.includes(item)) {
        return true;
      }
    }
  }

  if (compare.labels) {
    for (const item of compare.labels) {
      if (reference && reference.labels && reference.labels.includes(item)) {
        return true;
      }
    }
  }

  return false;
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
  const config = await getChangelogConfiguration();
  const { owner, repo } = context.repo;

  for (const commit of bump.messages) {
    const bumpLabel = `bump:${SemVerType[commit.bump].toLowerCase()}`;
    const exclusionPatterns: IExcludeConfiguration = {
      labels: [],
      authors: [],
    };

    // We will reuse the labels and author associated with a Pull Request
    // (with the exception of `bump:<version`) for all commits associated
    // with the PR.

    if (commit.hexsha) {
      const pullRequests = await getAssociatedPullRequests(commit.hexsha);

      if (pullRequests.length > 0) {
        const pullRequest = pullRequests[0];

        // Check the labels in the Pull Request associated with this commit
        for (const label of pullRequest.labels) {
          // Ignore bump-labels on Pull Requests
          if (label.name.startsWith("bump:")) {
            continue;
          }

          exclusionPatterns.labels?.push(label.name);
        }
        // Check for the author of the Pull Request
        if (pullRequest.user) {
          exclusionPatterns.authors?.push(pullRequest.user.login);
        }
      }
    }

    // Check the individual commit Bump Level
    exclusionPatterns.labels?.push(bumpLabel);

    if (hasConfigurationElement(exclusionPatterns, config.changelog.exclude)) {
      continue;
    }

    for (const category of config.changelog.categories) {
      // Apply all exclusion patterns from Pull Request metadata on Category
      if (hasConfigurationElement(exclusionPatterns, category.exclude)) {
        continue;
      }

      // Validate whether the commit matches any of the inclusion patterns
      if (
        !hasConfigurationElement(
          { labels: exclusionPatterns.labels?.concat([bumpLabel, "*"]) },
          { labels: category.labels }
        )
      ) {
        continue;
      }

      if (!category["messages"]) {
        category["messages"] = [];
      }
      category["messages"].push(await generateChangelogEntry(commit));
      break;
    }
  }

  let formattedChangelog = "## What's changed\n";
  for (const category of config.changelog.categories) {
    if (category["messages"] && category["messages"].length > 0) {
      formattedChangelog += `### ${category.title}\n`;
      for (const message of category["messages"]) {
        formattedChangelog += `* ${message}\n`;
      }
    }
  }

  const diffRange = `${bump.foundVersion.toString()}...${bump.foundVersion
    .bump(bump.requiredBump)
    ?.toString()}`;
  formattedChangelog += `\n\n*Diff since last release: [${diffRange}](https://github.com/${owner}/${repo}/compare/${diffRange})*`;

  return formattedChangelog;
}
