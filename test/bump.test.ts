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

import * as crypto from "crypto";
import * as core from "@actions/core";
import * as gh from "@actions/github";
import * as github from "../src/github";
import * as bumpaction from "../src/actions/bump";
import * as changelog from "../src/changelog";

import * as fs from "fs";
import { SemVer } from "../src/semver";
import { RequestError } from "@octokit/request-error";

jest.mock("fs", () => ({
  promises: { access: jest.fn() },
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));
jest.mock("@actions/core");
jest.mock("@actions/github");
//jest.mock("@octokit/request-error");
jest.mock("../src/github");
jest.mock("../src/changelog");

const toICommit = msg => ({
  message: msg,
  sha: crypto.createHash("sha1").update(msg).digest("hex").substring(0, 20),
});
const PATCH_MSG = toICommit("fix: something");
const MINOR_MSG = toICommit("feat: add something");
const MAJOR_MSG = toICommit("chore!: make and break something");
const MAJOR_MSG_FOOTER = toICommit("fix: break\n\nBREAKING-CHANGE: something");
const NONE_MSG1 = toICommit("perf: make something faster");
const NONE_MSG2 = toICommit("refactor: make something easier to maintain");
const NONE_MSG3 = toICommit("build: make something more efficiently");
const PRTITLE = type_ => `${type_}: simple PR title`;

const INITIAL_VERSION = "1.2.3";
const PATCH_BUMPED_VERSION = "1.2.4";
const MINOR_BUMPED_VERSION = "1.3.0";
const MAJOR_BUMPED_VERSION = "2.0.0";
const HEAD_SHA = "baaadb0b";
const BASE_COMMIT = { message: "chore: base commit", sha: "f00dcafe" };

const CHANGELOG_PLACEHOLDER = "CHANGELOG_PLACEHOLDER";

const DEFAULT_COMMIT_LIST = [
  NONE_MSG1,
  NONE_MSG2,
  NONE_MSG3,
  BASE_COMMIT, // order matters; newest first, base last
];

// @ts-ignore - run() is called on inclusion of the module
gh.context = { ref: "refs/heads/main", sha: HEAD_SHA };

const mockGetInput = (setting, options?) => {
  switch (setting) {
    case "version-prefix":
      return "*";
    case "config":
      return ".commisery.yml";
    case "build-metadata":
      return "";
  }
  throw new Error(`getInput("${setting}") not mocked`);
};

const mockGetBooleanInput = (setting, options?) => {
  switch (setting) {
    case "create-release":
      return true;
    case "create-tag":
      return false;
  }
  expect("error").toBe(`getBooleanInput("${setting}") not mocked`);
  return false;
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(github, "isPullRequestEvent").mockReturnValue(false);
  jest.spyOn(github, "createTag").mockResolvedValue();
  jest.spyOn(github, "createRelease").mockResolvedValue();

  jest.spyOn(core, "getInput").mockImplementation(mockGetInput);
  jest.spyOn(core, "getBooleanInput").mockImplementation(mockGetBooleanInput);

  jest
    .spyOn(changelog, "generateChangelog")
    .mockResolvedValue(CHANGELOG_PLACEHOLDER);

  jest.spyOn(github, "getLatestTags").mockResolvedValue([
    {
      name: INITIAL_VERSION,
      commitSha: BASE_COMMIT.sha,
    },
  ]);
  jest.spyOn(github, "getPullRequestTitle").mockResolvedValue(PRTITLE("ci"));
  jest.spyOn(github, "getCommitsSince").mockResolvedValue(DEFAULT_COMMIT_LIST);

  /*
  jest.spyOn(core, "info").mockImplementation(console.log);
  jest.spyOn(core, "warning").mockImplementation(console.log);
  jest.spyOn(core, "error").mockImplementation(console.log);
  jest.spyOn(core, "setFailed").mockImplementation(console.log);
  */
});

describe("Bump functionality", () => {
  const bumpTests = [
    {
      testDescription: "no bump required",
      messages: [NONE_MSG1, NONE_MSG2, NONE_MSG3],
      prTitle: PRTITLE("chore"),
      expectedVersion: "",
    },
    {
      testDescription: "bump patch",
      messages: [PATCH_MSG, NONE_MSG1, PATCH_MSG, NONE_MSG2],
      prTitle: PRTITLE("fix"),
      expectedVersion: PATCH_BUMPED_VERSION,
    },
    {
      testDescription: "bump minor",
      messages: [PATCH_MSG, MINOR_MSG, PATCH_MSG, NONE_MSG1],
      expectedVersion: MINOR_BUMPED_VERSION,
      prTitle: PRTITLE("feat"),
    },
    {
      testDescription: "bump major",
      messages: [PATCH_MSG, MINOR_MSG, MAJOR_MSG, NONE_MSG1],
      prTitle: PRTITLE("feat!"),
      expectedVersion: MAJOR_BUMPED_VERSION,
    },
    {
      testDescription: "bump major by footer",
      messages: [PATCH_MSG, MINOR_MSG, MAJOR_MSG_FOOTER, NONE_MSG1],
      prTitle: PRTITLE("chore"),
      expectedVersion: MAJOR_BUMPED_VERSION,
    },
  ];

  test.each(bumpTests)(
    "$testDescription",
    async ({ messages, prTitle, expectedVersion }) => {
      jest.spyOn(github, "getPullRequestTitle").mockResolvedValue(prTitle);
      jest
        .spyOn(github, "getCommitsSince")
        .mockResolvedValue(messages.concat(DEFAULT_COMMIT_LIST));

      await bumpaction.exportedForTesting.run();
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining(`Found SemVer tag: ${INITIAL_VERSION}`)
      );
      if (expectedVersion == "") {
        expect(core.info).toHaveBeenCalledWith(
          expect.stringContaining(`No bump necessary`)
        );
      } else {
        expect(github.createTag).not.toHaveBeenCalled();
        expect(github.createRelease).toHaveBeenCalledTimes(1);
        expect(github.createRelease).toHaveBeenCalledWith(
          expectedVersion,
          HEAD_SHA,
          CHANGELOG_PLACEHOLDER,
          false
        );
      }
      expect(core.setOutput).toBeCalledWith("current-version", INITIAL_VERSION);
      expect(core.setOutput).toBeCalledWith("next-version", expectedVersion);
      expect(core.warning).not.toHaveBeenCalled();
      expect(core.error).not.toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    }
  );
});

describe("Releases and tags", () => {
  beforeEach(() => {
    jest
      .spyOn(github, "getCommitsSince")
      .mockResolvedValue(
        [toICommit("fix: valid message")].concat(DEFAULT_COMMIT_LIST)
      );
  });

  // prettier-ignore
  const relTests = [
    { desc: "no release, no tag", rel: false, tag: false },
    { desc: "release, no tag",    rel: true,  tag: false },
    { desc: "no release, tag",    rel: false, tag: true  },
    { desc: "release, tag",       rel: true,  tag: true  },
  ];

  test.each(relTests)("$desc", async ({ rel, tag }) => {
    jest
      .spyOn(core, "getBooleanInput")
      .mockImplementation((setting, options?) => {
        switch (setting) {
          case "create-release":
            return rel;
          case "create-tag":
            return tag;
        }
        return false;
      });

    await bumpaction.exportedForTesting.run();
    if (!rel && !tag) {
      expect(core.startGroup).toHaveBeenCalledWith(
        expect.stringContaining(
          `Not creating tag or release for ${PATCH_BUMPED_VERSION}..`
        )
      );
      expect(github.createTag).not.toHaveBeenCalled();
      expect(github.createRelease).not.toHaveBeenCalled();
      expect(changelog.generateChangelog).not.toHaveBeenCalled();
    } else if (!rel && tag) {
      expect(core.startGroup).toHaveBeenCalledWith(
        expect.stringContaining(`Creating tag ${PATCH_BUMPED_VERSION}..`)
      );
      expect(github.createTag).toHaveBeenCalledTimes(1);
      expect(github.createRelease).not.toHaveBeenCalled();
      expect(changelog.generateChangelog).not.toHaveBeenCalled();
    } else if (rel && !tag) {
      expect(core.startGroup).toHaveBeenCalledWith(
        expect.stringContaining(`Creating release ${PATCH_BUMPED_VERSION}..`)
      );
      expect(github.createTag).not.toHaveBeenCalled();
      expect(github.createRelease).toHaveBeenCalledTimes(1);
      expect(changelog.generateChangelog).toHaveBeenCalledTimes(1);
    } else {
      expect(core.warning).toHaveBeenCalledTimes(1);
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining("not needed")
      );
      // Warn only when both are set; release takes precedence
      expect(github.createRelease).toHaveBeenCalledTimes(1);
      expect(github.createTag).not.toHaveBeenCalled();
      expect(changelog.generateChangelog).toHaveBeenCalledTimes(1);
    }
    if (!(tag && rel)) expect(core.warning).not.toHaveBeenCalled();
    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});

describe("Trouble bumping", () => {
  const MOCK_REQUESTERROR = statusCode =>
    new RequestError("Mocked Error", statusCode, {
      request: {
        method: "GET",
        url: "https://example.com",
        headers: { header: "" },
      },
      response: {
        status: statusCode,
        url: "",
        data: "",
        headers: { header: "" },
      },
    });
  beforeEach(() => {
    jest
      .spyOn(github, "getCommitsSince")
      .mockResolvedValue([PATCH_MSG].concat(DEFAULT_COMMIT_LIST));
  });

  test("no matching tags found", async () => {
    jest.spyOn(github, "getLatestTags").mockResolvedValue([
      {
        name: INITIAL_VERSION,
        commitSha: "000",
      },
    ]);
    await bumpaction.exportedForTesting.run();
    expect(core.warning).toHaveBeenCalledTimes(1);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("No matching SemVer tags found")
    );

    expect(core.setOutput).toBeCalledWith("current-version", "");
    expect(core.setOutput).toBeCalledWith("next-version", "");

    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("contains non-conventional commits", async () => {
    const invalidMessage = "FEAT: Invalid message.";
    jest
      .spyOn(github, "getCommitsSince")
      .mockResolvedValue(
        [toICommit(invalidMessage), PATCH_MSG].concat(DEFAULT_COMMIT_LIST)
      );

    await bumpaction.exportedForTesting.run();
    // Warning about compliance, as well as what's wrong with the commit(s)
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("not comply")
    );
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("C001"), // Type tag lower case
      { title: expect.stringContaining(invalidMessage) }
    );
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("C003"), // Don't start description with uppercase
      { title: expect.stringContaining(invalidMessage) }
    );

    // Still handle proper commits and bump correctly
    expect(core.setOutput).toBeCalledWith("current-version", INITIAL_VERSION);
    expect(core.setOutput).toBeCalledWith("next-version", PATCH_BUMPED_VERSION);

    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("can't create tag, unknown reason", async () => {
    jest.spyOn(github, "createTag").mockRejectedValue;
    jest.spyOn(github, "createRelease").mockImplementation(() => {
      throw new Error("Mocked error");
    });

    await bumpaction.exportedForTesting.run();

    expect(github.getShaForTag).toHaveBeenCalledTimes(1);

    expect(core.setOutput).toBeCalledWith("current-version", INITIAL_VERSION);
    expect(core.setOutput).toBeCalledWith("next-version", PATCH_BUMPED_VERSION);

    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Unable to create release with the name")
    );
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Mocked error")
    );
  });

  test("can't create tag, random HTTP error", async () => {
    jest.spyOn(github, "createRelease").mockImplementation(() => {
      throw new Error("Mocked error");
    });

    await bumpaction.exportedForTesting.run();

    expect(github.getShaForTag).toHaveBeenCalledTimes(1);

    expect(core.setOutput).toBeCalledWith("current-version", INITIAL_VERSION);
    expect(core.setOutput).toBeCalledWith("next-version", PATCH_BUMPED_VERSION);

    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Unable to create release with the name")
    );
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Mocked error")
    );
  });

  test("tag already exists", async () => {
    jest.spyOn(github, "getShaForTag").mockResolvedValue("123456");
    jest
      .spyOn(github, "createRelease")
      .mockRejectedValue(MOCK_REQUESTERROR(422));

    await bumpaction.exportedForTesting.run();

    expect(github.getShaForTag).toHaveBeenCalledTimes(1);
    expect(github.getShaForTag).toHaveBeenCalledWith(
      `refs/tags/${PATCH_BUMPED_VERSION}`
    );

    expect(core.setOutput).toBeCalledWith("current-version", INITIAL_VERSION);
    expect(core.setOutput).toBeCalledWith("next-version", PATCH_BUMPED_VERSION);

    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("currently points to 123456")
    );
  });
});

describe("Initial development", () => {
  const INITIAL_DEVELOPMENT_VERSION = "0.99.100";

  beforeEach(() => {
    jest.spyOn(fs, "existsSync").mockReturnValue(true);
    jest.spyOn(github, "getLatestTags").mockResolvedValue([
      {
        name: INITIAL_DEVELOPMENT_VERSION,
        commitSha: BASE_COMMIT.sha,
      },
    ]);
  });

  test("initial development does not bump major", async () => {
    jest.spyOn(fs, "readFileSync").mockReturnValue("initial-development: true");
    jest
      .spyOn(github, "getCommitsSince")
      .mockResolvedValue(
        [toICommit("chore!: breaking change")].concat(DEFAULT_COMMIT_LIST)
      );

    await bumpaction.exportedForTesting.run();
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("This repository is under 'initial development'")
    );

    // Bump minor, not major
    expect(core.setOutput).toBeCalledWith(
      "current-version",
      INITIAL_DEVELOPMENT_VERSION
    );
    expect(core.setOutput).toBeCalledWith(
      "next-version",
      SemVer.fromString(INITIAL_DEVELOPMENT_VERSION)?.nextMinor().toString()
    );

    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("first non-initial development build bumps major regardless", async () => {
    jest
      .spyOn(fs, "readFileSync")
      .mockReturnValue("initial-development: false");
    jest
      .spyOn(github, "getCommitsSince")
      .mockResolvedValue(DEFAULT_COMMIT_LIST);

    await bumpaction.exportedForTesting.run();
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Enforcing version `1.0.0`")
    );

    // Bump major, even with non-bumping commits
    expect(core.setOutput).toBeCalledWith(
      "current-version",
      INITIAL_DEVELOPMENT_VERSION
    );
    expect(core.setOutput).toBeCalledWith("next-version", "1.0.0");
    expect(github.createRelease).toHaveBeenCalledTimes(1);
    expect(github.createRelease).toHaveBeenCalledWith(
      "1.0.0",
      HEAD_SHA,
      CHANGELOG_PLACEHOLDER,
      false
    );

    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});
