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
import { IVersionBumpTypeAndMessages } from "./interfaces";
import { SemVerType } from "./semver";

export function generateChangelog(bump: IVersionBumpTypeAndMessages): string {
  if (bump.foundVersion === null) {
    return "";
  }

  interface IChangelogEntry {
    title: string;
    emoji: string;
    changes: string[];
  }
  const changelog = new Map<SemVerType, IChangelogEntry>();
  changelog.set(SemVerType.MAJOR, {
    title: "Breaking Changes",
    emoji: "warning",
    changes: [],
  });
  changelog.set(SemVerType.MINOR, {
    title: "New Features",
    emoji: "rocket",
    changes: [],
  });
  changelog.set(SemVerType.PATCH, {
    title: "Bug Fixes",
    emoji: "bug",
    changes: [],
  });
  changelog.set(SemVerType.NONE, {
    title: "Other changes",
    emoji: "construction_worker",
    changes: [],
  });

  const { owner, repo } = context.repo;
  const ISSUE_REGEX = new RegExp(`[A-Z]+-[0-9]+`, "g");
  for (const commit of bump.messages) {
    let msg = `${commit.description
      .charAt(0)
      .toUpperCase()}${commit.description.slice(1)}`;
    if (commit.hexsha) {
      const sha_link = `[${commit.hexsha.slice(
        0,
        6
      )}](https://github.com/${owner}/${repo}/commit/${commit.hexsha})`;
      msg += ` [${sha_link}]`;
    }

    let issue_references: string[] = [];
    for (const footer of commit.footers) {
      const matches = footer.value.matchAll(ISSUE_REGEX);
      for (const match of matches) {
        issue_references.push(match[0]);
      }
    }
    if (issue_references.length > 0) {
      msg += `(${issue_references.join(", ")})`;
    }

    changelog.get(commit.bump)?.changes.push(msg);
  }

  let changelog_formatted = "## What's changed\n";
  changelog.forEach((value: IChangelogEntry) => {
    if (value.changes.length > 0) {
      changelog_formatted += `### :${value.emoji}: ${value.title}\n`;
      for (const msg of value.changes) {
        changelog_formatted += `* ${msg}\n`;
      }
    }
  });

  const diff_range = `${bump.foundVersion.to_string()}...${bump.foundVersion
    .bump(bump.requiredBump)
    ?.to_string()}`;
  changelog_formatted += `\n\n*Diff since last release: [${diff_range}](https://github.com/${owner}/${repo}/compare/${diff_range})*`;

  return changelog_formatted;
}
