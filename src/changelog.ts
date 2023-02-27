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
import { IVersionBumpTypeAndMessages, IValidationResult } from "./interfaces";
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
    group?: "scope";
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

type TChangelog = Map<string, Map<string, string[]>>;

/**
 * Capitalizes the first character of the provided string
 */
function capitalizeFirstLetter(data: string): string {
  return data.charAt(0).toUpperCase() + data.slice(1).toLowerCase();
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

  const changelog: TChangelog = new Map();
  for (const commit of bump.processedCommits) {
    if (!commit.message) continue;

    const bumpLabel = `bump:${SemVerType[commit.message.bump].toLowerCase()}`;
    const typeLabel = `type:${commit.message.type.toLowerCase()}`;
    const scopeLabel = `scope:${commit.message?.scope?.toLowerCase() || "*"}`;

    // Adds the following items as "virtual" labels for each commit:
    // * The version bump (`bump:<version>`)
    // * The conventional commit type (`type:<type>`)
    // * The conventional commit scope (`scope:<scope>`)
    let labels: string[] = [bumpLabel, typeLabel, scopeLabel];

    // We will reuse the labels and author associated with a Pull Request
    // (with the exception of `bump:<version>` and `scope:<scope>`) for all
    // commits associated with the PR.

    if (commit.message.hexsha) {
      const pullRequests = await getAssociatedPullRequests(
        commit.message.hexsha
      );

      if (pullRequests.length > 0) {
        const pullRequest = pullRequests[0];

        // Append the labels of the associated Pull Request
        // NOTE: we ignore the version bump and scope label on the PR as this is
        //       and instead rely on version bump label associated with this
        //       commit.
        labels = labels.concat(
          pullRequest.labels
            .filter(
              label =>
                !label.name.startsWith("bump:") &&
                !label.name.startsWith("scope:")
            )
            .map(label => label.name)
        );

        // Check if the author of the Pull Request is part of the exclude list
        if (
          pullRequest.user &&
          config.changelog.exclude?.authors?.includes(pullRequest.user.login)
        ) {
          continue;
        }
      }
    }

    // Check if any of the labels is part of the global exclusion list
    if (
      labels.some(label => config.changelog.exclude?.labels?.includes(label))
    ) {
      continue;
    }

    // Either group commits per Conventional Commit scope, or group them all
    // together (*)
    const scope =
      config.changelog.group === "scope"
        ? commit.message?.scope?.toLowerCase() || "*"
        : "*";

    changelog.set(scope, changelog.get(scope) ?? new Map<string, string[]>());
    for (const category of config.changelog.categories) {
      // Apply all exclusion patterns from Pull Request metadata on Category
      if (labels.some(label => category.exclude?.labels?.includes(label))) {
        continue;
      }

      // Validate whether the commit matches any of the inclusion patterns
      if (
        !labels
          .concat([bumpLabel, "*"])
          .some(label => category.labels?.includes(label))
      ) {
        continue;
      }

      if (changelog.get(scope)?.get(category.title) === undefined) {
        changelog.get(scope)?.set(category.title, []);
      }

      changelog
        .get(scope)
        ?.get(category.title)
        ?.push(await generateChangelogEntry(commit.message));

      break;
    }
  }

  // Sort changelog, with the all (*) scope always as last item
  const sortedChangelog = [...changelog].sort((a, b) =>
    a[0] === "*" ? 1 : b[0] === "*" ? -1 : a[0].localeCompare(b[0])
  );

  // Generate Changelog
  let formattedChangelog = "## What's changed\n";
  for (const [scope, categories] of sortedChangelog) {
    const isGrouped = scope !== "*";
    if (isGrouped) {
      formattedChangelog += `### ${capitalizeFirstLetter(scope)}\n`;
    }
    for (const [category, messages] of categories) {
      if (messages.length > 0) {
        formattedChangelog += isGrouped
          ? `#### ${category}\n`
          : `### ${category}\n`;
        for (const message of messages) {
          formattedChangelog += `* ${message}\n`;
        }
      }
    }
  }

  const diffRange =
    `${bump.foundVersion.toString()}...` +
    `${bump.foundVersion.bump(bump.requiredBump)?.toString()}`;
  formattedChangelog += `\n\n*Diff since last release: [${diffRange}](https://github.com/${owner}/${repo}/compare/${diffRange})*`;

  return formattedChangelog;
}
