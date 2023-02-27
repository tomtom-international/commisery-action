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

import dedent from "dedent";

import { ConventionalCommitMessage } from "../src/commit";
import { generateChangelog } from "../src/changelog";
import { IVersionBumpTypeAndMessages, ICommit } from "../src/interfaces";
import { SemVer, SemVerType } from "../src/semver";
const github = require("../src/github");
const githubActions = require("@actions/github");

function createMessages(messages: ICommit[]) {
  return messages.map(c => {
    return {
      input: c,
      message: new ConventionalCommitMessage(c.message, c.sha), // don't catch exceptions
      errors: [],
    };
  });
}

// Validate Changelog Generation
//
describe("Generate Changelog", () => {
  beforeAll(() => {
    jest.spyOn(githubActions.context, "repo", "get").mockImplementation(() => {
      return {
        owner: "tomtom-international",
        repo: "commisery-action",
        eventName: "pull_request",
        issue: {
          number: 123,
        },
      };
    });

    jest
      .spyOn(github, "getAssociatedPullRequests")
      .mockImplementation(() => [{ number: "123", labels: [] }]);
  });

  test("All types of changes", async () => {
    const bump: IVersionBumpTypeAndMessages = {
      foundVersion: new SemVer({ major: 1, minor: 0, patch: 0 }),
      requiredBump: SemVerType.MINOR,
      processedCommits: createMessages([
        { message: "feat!: breaks the API", sha: "17e57c03317" },
        { message: "feat: add new feature", sha: "27e57c03317" },
        { message: "fix: avoid crash", sha: "37e57c03317" },
        { message: "ci: non-bumping commit", sha: "47e57c03317" },
      ]),
    };
    const changelog = await generateChangelog(bump);
    expect(changelog).toEqual(
      dedent(
        `## What's changed
          ### :warning: Breaking Changes
          * Breaks the API (#123) [[17e57c](https://github.com/tomtom-international/commisery-action/commit/17e57c03317)]
          ### :rocket: New Features
          * Add new feature (#123) [[27e57c](https://github.com/tomtom-international/commisery-action/commit/27e57c03317)]
          ### :bug: Bug Fixes
          * Avoid crash (#123) [[37e57c](https://github.com/tomtom-international/commisery-action/commit/37e57c03317)]
          ### :construction_worker: Other changes
          * Non-bumping commit (#123) [[47e57c](https://github.com/tomtom-international/commisery-action/commit/47e57c03317)]
  
  
          *Diff since last release: [1.0.0...1.1.0](https://github.com/tomtom-international/commisery-action/compare/1.0.0...1.1.0)*`
      )
    );
  });

  test("Missing PR reference", async () => {
    const bump: IVersionBumpTypeAndMessages = {
      foundVersion: new SemVer({ major: 1, minor: 0, patch: 0 }),
      requiredBump: SemVerType.MINOR,
      processedCommits: createMessages([
        { message: "feat: add pull request reference", sha: "0x123abc" },
      ]),
    };
    const changelog = await generateChangelog(bump);
    expect(changelog).toEqual(
      dedent(
        `## What's changed
        ### :rocket: New Features
        * Add pull request reference (#123) [[0x123a](https://github.com/tomtom-international/commisery-action/commit/0x123abc)]


        *Diff since last release: [1.0.0...1.1.0](https://github.com/tomtom-international/commisery-action/compare/1.0.0...1.1.0)*`
      )
    );
  });

  test("Contains PR reference", async () => {
    const bump: IVersionBumpTypeAndMessages = {
      foundVersion: new SemVer({ major: 1, minor: 0, patch: 0 }),
      requiredBump: SemVerType.MINOR,
      processedCommits: createMessages([
        { message: "feat: add pull request reference (#1)", sha: "0x123abc" },
      ]),
    };
    const changelog = await generateChangelog(bump);
    expect(changelog).toEqual(
      dedent(
        `## What's changed
        ### :rocket: New Features
        * Add pull request reference (#1) [[0x123a](https://github.com/tomtom-international/commisery-action/commit/0x123abc)]


        *Diff since last release: [1.0.0...1.1.0](https://github.com/tomtom-international/commisery-action/compare/1.0.0...1.1.0)*`
      )
    );
  });

  test("Issue reference", async () => {
    const bump: IVersionBumpTypeAndMessages = {
      foundVersion: new SemVer({ major: 1, minor: 0, patch: 0 }),
      requiredBump: SemVerType.MINOR,
      processedCommits: createMessages([
        {
          message:
            "feat: add pull request reference\n\nThis is the body\n\nImplements: TEST-123",
          sha: "17e57c03317",
        },
        {
          message:
            "feat: do GitHub things\n\nThis is the body\n\nImplements #42",
          sha: "27e57c03317",
        },
        {
          message:
            "feat: make GitHub stuff\n\nThis is the body\n\nImplements: #51",
          sha: "37e57c03317",
        },
      ]),
    };
    const changelog = await generateChangelog(bump);
    expect(changelog).toEqual(
      dedent(
        `## What's changed
        ### :rocket: New Features
        * Add pull request reference (#123) (TEST-123) [[17e57c](https://github.com/tomtom-international/commisery-action/commit/17e57c03317)]
        * Do GitHub things (#123) (#42) [[27e57c](https://github.com/tomtom-international/commisery-action/commit/27e57c03317)]
        * Make GitHub stuff (#123) (#51) [[37e57c](https://github.com/tomtom-international/commisery-action/commit/37e57c03317)]


        *Diff since last release: [1.0.0...1.1.0](https://github.com/tomtom-international/commisery-action/compare/1.0.0...1.1.0)*`
      )
    );
  });

  test("Exclusion labels (Global)", async () => {
    const bump: IVersionBumpTypeAndMessages = {
      foundVersion: new SemVer({ major: 1, minor: 0, patch: 0 }),
      requiredBump: SemVerType.MINOR,
      processedCommits: createMessages([
        {
          message:
            "feat!: add pull request reference\n\nThis is the body\n\nImplements: TEST-123",
          sha: "17e57c03317",
        },
        {
          message:
            "feat: do GitHub things\n\nThis is the body\n\nImplements #42",
          sha: "27e57c03317",
        },
      ]),
    };

    jest.spyOn(github, "getReleaseConfiguration").mockImplementation(() => {
      return JSON.stringify({
        changelog: {
          exclude: {
            labels: ["bump:major"],
          },
          categories: [
            {
              title: "All changes",
              labels: ["*"],
            },
          ],
        },
      });
    });

    const changelog = await generateChangelog(bump);
    expect(changelog).toEqual(
      dedent(
        `## What's changed
        ### All changes
        * Do GitHub things (#123) (#42) [[27e57c](https://github.com/tomtom-international/commisery-action/commit/27e57c03317)]


        *Diff since last release: [1.0.0...1.1.0](https://github.com/tomtom-international/commisery-action/compare/1.0.0...1.1.0)*`
      )
    );
  });

  test("Exclusion labels (Category)", async () => {
    const bump: IVersionBumpTypeAndMessages = {
      foundVersion: new SemVer({ major: 1, minor: 0, patch: 0 }),
      requiredBump: SemVerType.MINOR,
      processedCommits: createMessages([
        {
          message:
            "feat!: this should be in all changes\n\nThis is the body\n\nImplements: TEST-123",
          sha: "17e57c03317",
        },
        {
          message:
            "feat: do GitHub things\n\nThis is the body\n\nImplements #42",
          sha: "27e57c03317",
        },
      ]),
    };

    jest.spyOn(github, "getReleaseConfiguration").mockImplementation(() => {
      return JSON.stringify({
        changelog: {
          categories: [
            {
              title: "This should be excluded",
              labels: ["*"],
              exclude: {
                labels: ["bump:major", "bump:minor"],
              },
            },
            {
              title: "All changes",
              labels: ["*"],
            },
          ],
        },
      });
    });

    const changelog = await generateChangelog(bump);
    expect(changelog).toEqual(
      dedent(
        `## What's changed
        ### All changes
        * This should be in all changes (#123) (TEST-123) [[17e57c](https://github.com/tomtom-international/commisery-action/commit/17e57c03317)]
        * Do GitHub things (#123) (#42) [[27e57c](https://github.com/tomtom-international/commisery-action/commit/27e57c03317)]


        *Diff since last release: [1.0.0...1.1.0](https://github.com/tomtom-international/commisery-action/compare/1.0.0...1.1.0)*`
      )
    );
  });

  test("Missing inclusion label", async () => {
    const bump: IVersionBumpTypeAndMessages = {
      foundVersion: new SemVer({ major: 1, minor: 0, patch: 0 }),
      requiredBump: SemVerType.MINOR,
      processedCommits: createMessages([
        {
          message:
            "feat!: add pull request reference\n\nThis is the body\n\nImplements: TEST-123",
          sha: "17e57c03317",
        },
        {
          message:
            "feat: do GitHub things\n\nThis is the body\n\nImplements #42",
          sha: "27e57c03317",
        },
      ]),
    };

    jest.spyOn(github, "getReleaseConfiguration").mockImplementation(() => {
      return JSON.stringify({
        changelog: {
          categories: [
            {
              title: "Major Changes",
              labels: ["bump:major"],
            },
          ],
        },
      });
    });

    const changelog = await generateChangelog(bump);
    expect(changelog).toEqual(
      dedent(
        `## What's changed
        ### Major Changes
        * Add pull request reference (#123) (TEST-123) [[17e57c](https://github.com/tomtom-international/commisery-action/commit/17e57c03317)]


        *Diff since last release: [1.0.0...1.1.0](https://github.com/tomtom-international/commisery-action/compare/1.0.0...1.1.0)*`
      )
    );
  });

  test("Conventional commit label", async () => {
    const bump: IVersionBumpTypeAndMessages = {
      foundVersion: new SemVer({ major: 1, minor: 0, patch: 0 }),
      requiredBump: SemVerType.MINOR,
      processedCommits: createMessages([
        {
          message:
            "feat(Search)!: add pull request reference\n\nThis is the body\n\nImplements: TEST-123",
          sha: "17e57c03317",
        },
        {
          message:
            "docs: do GitHub things\n\nThis is the body\n\nImplements #42",
          sha: "27e57c03317",
        },
      ]),
    };

    jest.spyOn(github, "getReleaseConfiguration").mockImplementation(() => {
      return JSON.stringify({
        changelog: {
          categories: [
            {
              title: "Search API",
              labels: ["scope:search"],
            },
            {
              title: "Documentation",
              labels: ["type:docs"],
            },
          ],
        },
      });
    });

    const changelog = await generateChangelog(bump);
    expect(changelog).toEqual(
      dedent(
        `## What's changed
        ### Search API
        * Add pull request reference (#123) (TEST-123) [[17e57c](https://github.com/tomtom-international/commisery-action/commit/17e57c03317)]
        ### Documentation
        * Do GitHub things (#123) (#42) [[27e57c](https://github.com/tomtom-international/commisery-action/commit/27e57c03317)]


        *Diff since last release: [1.0.0...1.1.0](https://github.com/tomtom-international/commisery-action/compare/1.0.0...1.1.0)*`
      )
    );
  });
  
  afterAll(() => {
    jest.restoreAllMocks();
  });
});
