/**
 * Copyright (C) 2023, TomTom (http://tomtom.com).
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

import * as github from "../src/github";
jest.mock("../src/github");

import * as core from "@actions/core";
jest.mock("@actions/core");

import { Configuration } from "../src/config";
import * as validate from "../src/actions/validate";

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(core, "getBooleanInput").mockReturnValue(true);
  jest.spyOn(github, "isPullRequestEvent").mockReturnValue(true);
});

const toICommit = msg => ({ message: msg, sha: "f00dface" });
const NOK_1 = toICommit("foo: invalid commit");
const NOK_2 = toICommit("FIX : ~nvalid commit!");
const NOK_3 = toICommit("ci: long\nmultiline\n\n INVALID-COMMIT: withfooter");
const OK_1 = toICommit("ci: valid commit");
const OK_2 = toICommit("chore: valid commit");
const OK_3 = toICommit("ci: valid commit\n\nWith body.\n\nAnd-Also: trailer");
const LONG_OK = toICommit(
  "perf: write a message that is getting very long, but is " +
    "still technically valid" // 79 chars, if you're wondering
);

describe("Valid cases", () => {
  const successMessagesAndPrTitleTestCases = [
    {
      testDescription: "one single valid commit",
      messages: [OK_1],
      prTitle: "ci: proper title",
    },
    {
      testDescription: "multiple valid commits",
      messages: [OK_1, OK_2, OK_3],
      prTitle: "ci: proper title",
    },
    {
      testDescription: "very long but still valid PR title",
      messages: [OK_1],
      prTitle: LONG_OK.message,
    },
    {
      testDescription: "very long but still valid commit message",
      messages: [
        toICommit(
          "ci: write a message that is getting very long, " +
            "but is still technically valid"
        ),
      ],
      prTitle: "ci: proper title",
    },
  ];

  test.each(successMessagesAndPrTitleTestCases)(
    "$testDescription",
    ({ testDescription, messages, prTitle }) => {
      jest.spyOn(github, "getCommitsInPR").mockResolvedValue(messages);
      jest.spyOn(github, "getPullRequestTitle").mockResolvedValue(prTitle);

      validate.exportedForTesting.run().then(() => {
        expect(core.info).toHaveBeenCalled();
        expect(core.warning).not.toHaveBeenCalled();
        expect(core.setFailed).not.toHaveBeenCalled();
      });
    }
  );
});

describe("Warning cases", () => {
  const warningMessagesAndPrTitleTestCases = [
    {
      testDescription: "no commits in pull request",
      messages: [],
      prTitle: "ci: valid pr title",
      warningMessages: ["No commits found"],
      alsoFail: false,
    },
    {
      testDescription: "cannot determine PR title bump level",
      messages: [],
      prTitle: "ci : invalid pr title",
      warningMessages: ["Cannot validate the consistency of bump levels"],
      alsoFail: true,
    },
  ];
  test.each(warningMessagesAndPrTitleTestCases)(
    "$testDescription",
    ({ testDescription, messages, prTitle, warningMessages, alsoFail }) => {
      jest.spyOn(github, "getCommitsInPR").mockResolvedValue(messages);
      jest.spyOn(github, "getPullRequestTitle").mockResolvedValue(prTitle);

      validate.exportedForTesting.run().then(() => {
        expect(core.warning).toHaveBeenCalled();
        for (const msg of warningMessages) {
          expect(core.warning).toHaveBeenCalledWith(
            expect.stringContaining(msg)
          );
        }
        if (alsoFail) {
          expect(core.setFailed).toHaveBeenCalled();
        } else {
          expect(core.setFailed).not.toHaveBeenCalled();
        }
      });
    }
  );
});

describe("Error cases", () => {
  const INVALID_CONVENTIONAL_COMMIT_MSG = "not valid Conventional Commits";
  const PR_TITLE_NOT_COMPLIANT_MSG = "pull request title is not compliant";
  const PR_TITLE_BUMP_LEVEL_ERROR_MSG = "bump level is not consistent";

  const failMessagesAndPrTitleTestCases = [
    {
      testDescription: "one invalid commit, two correct commits",
      messages: [OK_1, NOK_1, OK_2],
      prTitle: "ci: valid pr title",
      failureMessages: [INVALID_CONVENTIONAL_COMMIT_MSG],
    },
    {
      testDescription: "all invalid commits",
      messages: [NOK_1, NOK_2, NOK_3],
      prTitle: "ci: valid pr title",
      failureMessages: [INVALID_CONVENTIONAL_COMMIT_MSG],
    },
    {
      testDescription: "incorrect PR title",
      messages: [OK_1, OK_2],
      prTitle: "Ci : Invalid pr title!",
      failureMessages: [PR_TITLE_NOT_COMPLIANT_MSG],
    },
    {
      testDescription: "invalid commit and incorrect PR title",
      messages: [NOK_1],
      prTitle: "Ci : Invalid pr title!",
      failureMessages: [
        INVALID_CONVENTIONAL_COMMIT_MSG,
        PR_TITLE_NOT_COMPLIANT_MSG,
      ],
    },
    {
      testDescription: "bump level of PR title does not match",
      messages: [OK_1, OK_2, OK_3],
      prTitle: "feat!: different bump level",
      failureMessages: [PR_TITLE_BUMP_LEVEL_ERROR_MSG],
    },
  ];

  test.each(failMessagesAndPrTitleTestCases)(
    "$testDescription",
    ({ testDescription, messages, prTitle, failureMessages }) => {
      jest.spyOn(github, "getCommitsInPR").mockResolvedValue(messages);
      jest.spyOn(github, "getPullRequestTitle").mockResolvedValue(prTitle);

      validate.exportedForTesting.run().then(() => {
        expect(core.setFailed).toHaveBeenCalled();

        for (const msg of failureMessages) {
          expect(core.setFailed).toHaveBeenCalledWith(
            expect.stringContaining(msg)
          );
        }
      });
    }
  );
});

describe("Update labels", () => {
  const PATCH_MSG = toICommit("fix: something");
  const MINOR_MSG = toICommit("feat: add something");
  const MAJOR_MSG = toICommit("chore!: make and break something");
  const NONE_MSG = toICommit("perf: make something faster");

  const labelTests = [
    {
      messages: [PATCH_MSG, NONE_MSG, PATCH_MSG, NONE_MSG],
      expectedLabel: "patch",
      prTitle: PATCH_MSG.message,
      initialDevelopment: false,
    },
    {
      messages: [PATCH_MSG, MINOR_MSG, PATCH_MSG, NONE_MSG],
      expectedLabel: "minor",
      prTitle: MINOR_MSG.message,
      initialDevelopment: true,
    },
    {
      messages: [PATCH_MSG, MINOR_MSG, MAJOR_MSG, NONE_MSG],
      prTitle: MAJOR_MSG.message,
      expectedLabel: "major",
      initialDevelopment: false,
    },
    {
      messages: [PATCH_MSG, MINOR_MSG, MAJOR_MSG, NONE_MSG],
      prTitle: MAJOR_MSG.message,
      expectedLabel: "major",
      initialDevelopment: true,
    },
    {
      messages: [NONE_MSG, NONE_MSG, NONE_MSG],
      prTitle: NONE_MSG.message,
      expectedLabel: null,
      initialDevelopment: false,
    },
  ];
  test.each(labelTests)(
    "Bump $expectedLabel",
    ({ messages, prTitle, expectedLabel, initialDevelopment }) => {
      jest.spyOn(github, "getCommitsInPR").mockResolvedValue(messages);
      jest.spyOn(github, "getPullRequestTitle").mockResolvedValue(prTitle);
      jest.spyOn(github, "updateLabels");
      jest
        .spyOn(Configuration.prototype, "initialDevelopment", "get")
        .mockReturnValue(initialDevelopment);

      validate.exportedForTesting.run().then(() => {
        expect(core.info).toHaveBeenCalled();
        expect(core.setFailed).not.toHaveBeenCalled();
        expect(core.warning).not.toHaveBeenCalled();

        expect(github.updateLabels).toHaveBeenCalledTimes(1);
        let expectedLabels = [`bump:${expectedLabel}`];
        if (initialDevelopment) {
          expectedLabels = ["initial development"].concat(expectedLabels);
        }
        expect(github.updateLabels).toHaveBeenCalledWith(
          expectedLabel ? expectedLabels : []
        );
      });
    }
  );
});
