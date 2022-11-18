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
import { IVersionBumpTypeAndMessages } from "../src/interfaces";
import { SemVer, SemVerType } from "../src/semver";
const github = require("../src/github");
const github_actions = require("@actions/github");

// Validate Changelog Generation
//
describe("Generate Changelog", () => {
  beforeAll(() => {
    jest.spyOn(github_actions.context, "repo", "get").mockImplementation(() => {
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
      .mockImplementation(() => [{ number: "123" }]);
  });

  test("All types of changes", async () => {
    const bump: IVersionBumpTypeAndMessages = {
      foundVersion: new SemVer({ major: 1, minor: 0, patch: 0 }),
      requiredBump: SemVerType.MINOR,
      messages: [
        new ConventionalCommitMessage("feat!: breaks the API"),
        new ConventionalCommitMessage("feat: add new feature"),
        new ConventionalCommitMessage("fix: avoid crash"),
        new ConventionalCommitMessage("ci: non-bumping commit"),
      ],
    };
    const changelog = await generateChangelog(bump);
    expect(changelog).toEqual(
      dedent(
        `## What's changed
          ### :warning: Breaking Changes
          * Breaks the API
          ### :rocket: New Features
          * Add new feature
          ### :bug: Bug Fixes
          * Avoid crash
          ### :construction_worker: Other changes
          * Non-bumping commit
  
  
          *Diff since last release: [1.0.0...1.1.0](https://github.com/tomtom-international/commisery-action/compare/1.0.0...1.1.0)*`
      )
    );
  });

  test("Missing PR reference", async () => {
    const bump: IVersionBumpTypeAndMessages = {
      foundVersion: new SemVer({ major: 1, minor: 0, patch: 0 }),
      requiredBump: SemVerType.MINOR,
      messages: [
        new ConventionalCommitMessage(
          "feat: add pull request reference",
          "0x123abc"
        ),
      ],
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
      messages: [
        new ConventionalCommitMessage(
          "feat: add pull request reference (#1)",
          "0x123abc"
        ),
      ],
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
      messages: [
        new ConventionalCommitMessage(
          "feat: add pull request reference\n\nThis is the body\n\nImplements: TEST-123"
        ),
        new ConventionalCommitMessage(
          "feat: do GitHub things\n\nThis is the body\n\nImplements #42"
        ),
        new ConventionalCommitMessage(
          "feat: make GitHub stuff\n\nThis is the body\n\nImplements: #51"
        ),
      ],
    };
    const changelog = await generateChangelog(bump);
    expect(changelog).toEqual(
      dedent(
        `## What's changed
        ### :rocket: New Features
        * Add pull request reference (TEST-123)
        * Do GitHub things (#42)
        * Make GitHub stuff (#51)


        *Diff since last release: [1.0.0...1.1.0](https://github.com/tomtom-international/commisery-action/compare/1.0.0...1.1.0)*`
      )
    );
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });
});
