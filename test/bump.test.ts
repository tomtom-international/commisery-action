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

import * as core from "@actions/core";
import * as gh from "@actions/github";
import * as github from "../src/github";
import * as bumpaction from "../src/actions/bump";
import * as changelog from "../src/changelog";
import * as validate from "../src/validate";

import { getVersionBumpTypeAndMessages } from "../src/bump";
import * as fs from "fs";
import { SemVer } from "../src/semver";
import * as U from "./test_utils";
import { Configuration } from "../src/config";
import { IGitHubRelease, IGitTag, IVersionOutput } from "../src/interfaces";
import { BASE_COMMIT } from "./test_utils";
import { ALL_RULES } from "../src/rules";

jest.mock("fs", () => ({
  promises: { access: jest.fn() },
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));
jest.mock("@actions/core");
jest.mock("@actions/github");
jest.mock("../src/github");
jest.mock("../src/changelog");

// @ts-ignore - run() is called on inclusion of the module
gh.context = { ref: "refs/heads/main", sha: U.HEAD_SHA };

beforeEach(() => {
  jest.spyOn(github, "isPullRequestEvent").mockReturnValue(false);
  jest.spyOn(github, "createTag").mockResolvedValue(undefined);
  jest.spyOn(github, "createRelease").mockResolvedValue(undefined);

  jest.spyOn(core, "getInput").mockImplementation(U.mockGetInput);
  jest.spyOn(core, "getBooleanInput").mockImplementation(U.mockGetBooleanInput);

  jest
    .spyOn(changelog, "generateChangelog")
    .mockResolvedValue(U.CHANGELOG_PLACEHOLDER);

  jest.spyOn(github, "getAllTags").mockResolvedValue([
    {
      name: U.INITIAL_VERSION,
      ref: `refs/tags/${U.INITIAL_VERSION}`,
      sha: U.BASE_COMMIT.sha,
    },
  ]);
  jest.spyOn(github, "getPullRequestTitle").mockResolvedValue(U.PRTITLE("ci"));

  jest.spyOn(gh, "getOctokit");
  jest
    .spyOn(github, "matchTagsToCommits")
    .mockResolvedValue([
      SemVer.fromString(U.INITIAL_VERSION),
      U.DEFAULT_COMMIT_LIST,
    ]);

  /*
  jest.spyOn(core, "debug").mockImplementation(console.log);
  jest.spyOn(core, "info").mockImplementation(console.log);
  jest.spyOn(core, "warning").mockImplementation(console.log);
  jest.spyOn(core, "error").mockImplementation(console.log);
  jest.spyOn(core, "setFailed").mockImplementation(console.log);
  */
});

afterEach(() => {
  jest.resetAllMocks();
});

describe("Bump functionality", () => {
  const bumpTests = [
    {
      testDescription: "no bump required",
      messages: [U.NONE_MSG1, U.NONE_MSG2, U.NONE_MSG3],
      prTitle: U.PRTITLE("chore"),
      expectedVersion: "",
      expectedReleaseType: "",
    },
    {
      testDescription: "bump patch",
      messages: [U.PATCH_MSG, U.NONE_MSG1, U.PATCH_MSG, U.NONE_MSG2],
      prTitle: U.PRTITLE("fix"),
      expectedVersion: U.PATCH_BUMPED_VERSION,
      expectedReleaseType: "patch",
    },
    {
      // For default configurations, a revert commit will trigger a patch bump
      testDescription: "bump patch (revert)",
      messages: [U.toICommit("revert: valid message"), U.NONE_MSG1],
      prTitle: U.PRTITLE("revert"),
      expectedVersion: U.PATCH_BUMPED_VERSION,
      expectedReleaseType: "patch",
    },
    {
      testDescription: "bump minor",
      messages: [U.PATCH_MSG, U.MINOR_MSG, U.PATCH_MSG, U.NONE_MSG1],
      expectedVersion: U.MINOR_BUMPED_VERSION,
      prTitle: U.PRTITLE("feat"),
      expectedReleaseType: "minor",
    },
    {
      testDescription: "bump major",
      messages: [U.PATCH_MSG, U.MINOR_MSG, U.MAJOR_MSG, U.NONE_MSG1],
      prTitle: U.PRTITLE("feat!"),
      expectedVersion: U.MAJOR_BUMPED_VERSION,
      expectedReleaseType: "major",
    },
    {
      testDescription: "bump major by footer",
      messages: [U.PATCH_MSG, U.MINOR_MSG, U.MAJOR_MSG_FOOTER, U.NONE_MSG1],
      prTitle: U.PRTITLE("chore"),
      expectedVersion: U.MAJOR_BUMPED_VERSION,
      expectedReleaseType: "major",
    },
  ];

  test.each(bumpTests)(
    "$testDescription",
    async ({ messages, prTitle, expectedVersion, expectedReleaseType }) => {
      const release = {
        name: expectedVersion,
        description: U.CHANGELOG_PLACEHOLDER,
        id: 123456,
        draft: false,
        prerelease: false,
      } as any;
      jest.spyOn(github, "createRelease").mockResolvedValue(release);

      jest.spyOn(github, "getPullRequestTitle").mockResolvedValue(prTitle);
      jest
        .spyOn(github, "matchTagsToCommits")
        .mockResolvedValue([
          SemVer.fromString(U.INITIAL_VERSION),
          messages.concat(U.DEFAULT_COMMIT_LIST),
        ]);

      await bumpaction.run();
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining(`Found SemVer tag: ${U.INITIAL_VERSION}`)
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
          U.HEAD_SHA,
          U.CHANGELOG_PLACEHOLDER,
          false,
          false,
          undefined
        );
      }
      expect(core.setOutput).toHaveBeenCalledWith(
        "current-version",
        U.INITIAL_VERSION
      );
      if (expectedVersion) {
        expect(core.setOutput).toHaveBeenCalledWith(
          "next-version",
          expectedVersion
        );
        expect(core.setOutput).toHaveBeenCalledWith(
          "bump-metadata",
          JSON.stringify({
            bump: {
              from: U.INITIAL_VERSION,
              to: expectedVersion,
              type: expectedReleaseType,
            },
            tag: {
              name: expectedVersion,
              ref: `refs/tags/${expectedVersion}`,
              sha: U.HEAD_SHA,
            },
            release,
          })
        );
      } else {
        expect(core.setOutput).toHaveBeenCalledWith("next-version", "");
        expect(core.setOutput).toHaveBeenCalledWith("bump-metadata", "");
      }

      expect(core.warning).not.toHaveBeenCalled();
      expect(core.error).not.toHaveBeenCalled();
      expect(core.setFailed).not.toHaveBeenCalled();
    }
  );
});

describe("Releases and tags", () => {
  beforeEach(() => {
    jest
      .spyOn(github, "matchTagsToCommits")
      .mockResolvedValue([
        SemVer.fromString(U.INITIAL_VERSION),
        [U.toICommit("fix: valid message")].concat(U.DEFAULT_COMMIT_LIST),
      ]);
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
          case "create-changelog":
            return true;
        }
        return false;
      });

    const expectedTag: IGitTag | undefined =
      rel || tag
        ? {
            name: U.PATCH_BUMPED_VERSION,
            ref: `refs/tags/${U.PATCH_BUMPED_VERSION}`,
            sha: U.HEAD_SHA,
          }
        : undefined;

    const expectedRelease: IGitHubRelease | undefined = rel
      ? {
          name: U.PATCH_BUMPED_VERSION,
          id: 123456,
          draft: false,
          prerelease: false,
        }
      : undefined;

    jest.spyOn(github, "createRelease").mockResolvedValue(expectedRelease);
    jest.spyOn(github, "createTag").mockResolvedValue(expectedTag);

    await bumpaction.run();

    if (!rel && !tag) {
      expect(core.startGroup).toHaveBeenCalledWith(
        expect.stringContaining(
          `Not creating tag or release for ${U.PATCH_BUMPED_VERSION}..`
        )
      );
      expect(github.createTag).not.toHaveBeenCalled();
      expect(github.createRelease).not.toHaveBeenCalled();
    } else if (!rel && tag) {
      expect(core.startGroup).toHaveBeenCalledWith(
        expect.stringContaining(`Creating tag ${U.PATCH_BUMPED_VERSION}..`)
      );
      expect(github.createTag).toHaveBeenCalledTimes(1);
      expect(github.createRelease).not.toHaveBeenCalled();
    } else if (rel && !tag) {
      expect(core.startGroup).toHaveBeenCalledWith(
        expect.stringContaining(`Creating release ${U.PATCH_BUMPED_VERSION}..`)
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

    const expectedMetadata: IVersionOutput = {
      bump: {
        from: U.INITIAL_VERSION,
        to: U.PATCH_BUMPED_VERSION,
        type: "patch",
      },
      tag: expectedTag,
      release: expectedRelease,
    };

    expect(core.setOutput).toHaveBeenCalledWith(
      "current-version",
      U.INITIAL_VERSION
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "next-version",
      U.PATCH_BUMPED_VERSION
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "bump-metadata",
      JSON.stringify(expectedMetadata)
    );
  });
});

describe("Trouble bumping", () => {
  beforeEach(() => {
    jest
      .spyOn(github, "matchTagsToCommits")
      .mockResolvedValue([
        SemVer.fromString(U.INITIAL_VERSION),
        [U.PATCH_MSG].concat(U.DEFAULT_COMMIT_LIST),
      ]);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("no matching tags found", async () => {
    jest.spyOn(github, "getAllTags").mockResolvedValue([
      {
        name: U.INITIAL_VERSION,
        ref: `refs/tags/${U.INITIAL_VERSION}`,
        sha: "000",
      },
    ]);
    jest
      .spyOn(github, "matchTagsToCommits")
      .mockResolvedValue([null, [U.PATCH_MSG].concat(U.DEFAULT_COMMIT_LIST)]);
    await bumpaction.run();
    expect(core.warning).toHaveBeenCalledTimes(1);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("No matching SemVer tags found")
    );

    expect(core.setOutput).toHaveBeenCalledWith("current-version", "");
    expect(core.setOutput).toHaveBeenCalledWith("next-version", "");
    expect(core.setOutput).toHaveBeenCalledWith("bump-metadata", "");

    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("contains non-conventional commits", async () => {
    const invalidMessage = "FEAT: Invalid message.";
    jest
      .spyOn(github, "matchTagsToCommits")
      .mockResolvedValue([
        SemVer.fromString(U.INITIAL_VERSION),
        [U.toICommit(invalidMessage), U.PATCH_MSG].concat(
          U.DEFAULT_COMMIT_LIST
        ),
      ]);

    const release: IGitHubRelease = {
      name: U.PATCH_BUMPED_VERSION,
      id: 123456,
      draft: false,
      prerelease: false,
    };
    const tag: IGitTag = {
      name: U.PATCH_BUMPED_VERSION,
      ref: `refs/tags/${U.PATCH_BUMPED_VERSION}`,
      sha: U.HEAD_SHA,
    };

    jest.spyOn(github, "createRelease").mockResolvedValue(release);

    await bumpaction.run();
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
    expect(core.setOutput).toHaveBeenCalledWith(
      "current-version",
      U.INITIAL_VERSION
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "next-version",
      U.PATCH_BUMPED_VERSION
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "bump-metadata",
      JSON.stringify({
        bump: {
          from: U.INITIAL_VERSION,
          to: U.PATCH_BUMPED_VERSION,
          type: "patch",
        },
        tag,
        release,
      })
    );

    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("can't create tag, unknown reason", async () => {
    jest
      .spyOn(github, "createTag")
      .mockRejectedValue(new Error("Mocked error"));
    jest.spyOn(github, "createRelease").mockImplementation(() => {
      throw new Error("Mocked error");
    });

    await bumpaction.run();

    expect(github.getShaForTag).toHaveBeenCalledTimes(1);

    expect(core.setOutput).toHaveBeenCalledWith(
      "current-version",
      U.INITIAL_VERSION
    );
    expect(core.setOutput).toHaveBeenCalledWith("next-version", "");
    expect(core.setOutput).toHaveBeenCalledWith("bump-metadata", "");

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

    await bumpaction.run();

    expect(github.getShaForTag).toHaveBeenCalledTimes(1);

    expect(core.setOutput).toHaveBeenCalledWith(
      "current-version",
      U.INITIAL_VERSION
    );
    expect(core.setOutput).toHaveBeenCalledWith("next-version", "");
    expect(core.setOutput).toHaveBeenCalledWith("bump-metadata", "");

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
      .mockRejectedValue(U.getMockRequestError(422));

    await bumpaction.run();

    expect(github.getShaForTag).toHaveBeenCalledTimes(1);
    expect(github.getShaForTag).toHaveBeenCalledWith(
      `refs/tags/${U.PATCH_BUMPED_VERSION}`
    );

    expect(core.setOutput).toHaveBeenCalledWith(
      "current-version",
      U.INITIAL_VERSION
    );
    expect(core.setOutput).toHaveBeenCalledWith("next-version", "");
    expect(core.setOutput).toHaveBeenCalledWith("bump-metadata", "");

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
    jest.spyOn(github, "getAllTags").mockResolvedValue([
      {
        name: INITIAL_DEVELOPMENT_VERSION,
        ref: `refs/tags/${INITIAL_DEVELOPMENT_VERSION}`,
        sha: U.BASE_COMMIT.sha,
      },
    ]);
  });

  test("initial development does not bump major", async () => {
    jest.spyOn(fs, "readFileSync").mockReturnValue("initial-development: true");
    jest
      .spyOn(github, "matchTagsToCommits")
      .mockResolvedValue([
        SemVer.fromString(INITIAL_DEVELOPMENT_VERSION),
        [U.toICommit("chore!: breaking change")].concat(U.DEFAULT_COMMIT_LIST),
      ]);

    const nextVersion =
      SemVer.fromString(INITIAL_DEVELOPMENT_VERSION)?.nextMinor().toString() ||
      "";

    const release: IGitHubRelease = {
      name: nextVersion,
      id: 123456,
      draft: false,
      prerelease: false,
    };
    const tag: IGitTag = {
      name: nextVersion,
      ref: `refs/tags/${nextVersion}`,
      sha: U.HEAD_SHA,
    };

    jest.spyOn(github, "createRelease").mockResolvedValue(release);

    await bumpaction.run();
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining("This repository is under 'initial development'")
    );

    // Bump minor, not major
    expect(core.setOutput).toHaveBeenCalledWith(
      "current-version",
      INITIAL_DEVELOPMENT_VERSION
    );

    expect(core.setOutput).toHaveBeenCalledWith("next-version", nextVersion);
    expect(core.setOutput).toHaveBeenCalledWith(
      "bump-metadata",
      JSON.stringify({
        bump: {
          from: INITIAL_DEVELOPMENT_VERSION,
          to: nextVersion,
          type: "minor",
        },
        tag,
        release,
      })
    );

    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  test("first non-initial development build bumps major regardless", async () => {
    jest
      .spyOn(fs, "readFileSync")
      .mockReturnValue("initial-development: false");
    jest
      .spyOn(github, "matchTagsToCommits")
      .mockResolvedValue([
        SemVer.fromString(INITIAL_DEVELOPMENT_VERSION),
        U.DEFAULT_COMMIT_LIST,
      ]);

    const release: IGitHubRelease = {
      name: "1.0.0",
      id: 123456,
      draft: false,
      prerelease: false,
    };
    const tag: IGitTag = {
      name: "1.0.0",
      ref: `refs/tags/1.0.0`,
      sha: U.HEAD_SHA,
    };

    jest.spyOn(github, "createRelease").mockResolvedValue(release);

    await bumpaction.run();
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Enforcing version `1.0.0`")
    );

    // Bump major, even with non-bumping commits
    expect(core.setOutput).toHaveBeenCalledWith(
      "current-version",
      INITIAL_DEVELOPMENT_VERSION
    );
    expect(core.setOutput).toHaveBeenCalledWith("next-version", "1.0.0");
    expect(core.setOutput).toHaveBeenCalledWith(
      "bump-metadata",
      JSON.stringify({
        bump: {
          from: INITIAL_DEVELOPMENT_VERSION,
          to: "1.0.0",
          type: "major",
        },
        tag,
        release,
      })
    );

    expect(github.createRelease).toHaveBeenCalledTimes(1);
    expect(github.createRelease).toHaveBeenCalledWith(
      "1.0.0",
      U.HEAD_SHA,
      U.CHANGELOG_PLACEHOLDER,
      false,
      false,
      undefined
    );

    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});

describe("Create changelog", () => {
  const createChangelogInput = [
    { desc: "yes", createChangelog: true },
    { desc: "no", createChangelog: false },
  ];

  beforeEach(() => {
    jest
      .spyOn(github, "matchTagsToCommits")
      .mockResolvedValue([
        SemVer.fromString(U.INITIAL_VERSION),
        [U.toICommit("fix: valid message")],
      ]);
  });

  test.each(createChangelogInput)("$desc", async ({ createChangelog }) => {
    jest
      .spyOn(core, "getBooleanInput")
      .mockImplementation((setting, options?) => {
        switch (setting) {
          case "create-release":
            return true;
          case "create-tag":
            return false;
          case "create-changelog":
            return createChangelog;
        }
        return false;
      });

    await bumpaction.run();
    if (createChangelog) {
      expect(changelog.generateChangelog).toHaveBeenCalledTimes(1);
      expect(github.createRelease).toHaveBeenCalledTimes(1);
      expect(github.createRelease).toHaveBeenCalledWith(
        U.PATCH_BUMPED_VERSION,
        U.HEAD_SHA,
        U.CHANGELOG_PLACEHOLDER,
        false,
        false,
        undefined
      );
    } else {
      expect(changelog.generateChangelog).not.toHaveBeenCalled();
      expect(github.createRelease).toHaveBeenCalledTimes(1);
      expect(github.createRelease).toHaveBeenCalledWith(
        U.PATCH_BUMPED_VERSION,
        U.HEAD_SHA,
        "",
        false,
        false,
        undefined
      );
    }
  });
});

describe("Version prefix handling", () => {
  const TEST_VERSIONS = [
    { name: "versiona-3.4.5", ref: "refs/tags/versiona-3.4.5", sha: "345" },
    { name: "versionb-4.5.6", ref: "refs/tags/versionb-4.5.6", sha: "456" },
    { name: "versionc-1.2.3", ref: "refs/tags/versionc-1.2.3", sha: "123" },
    { name: "1.1.1", ref: "refs/tags/1.1.1", sha: "111" },
  ];
  const versionPrefixTests = [
    {
      desc: "no prefix",
      versionPrefixInput: null,
      versionPrefixConfig: null,
      expected: SemVer.fromString("versionb-4.5.6"),
    },
    {
      desc: "explicit no prefix",
      versionPrefixInput: "",
      versionPrefixConfig: "",
      expected: SemVer.fromString("1.1.1"),
    },
    {
      desc: "input prefix",
      versionPrefixInput: "versiona-",
      versionPrefixConfig: "",
      expected: SemVer.fromString("versiona-3.4.5"),
    },
    {
      desc: "config prefix",
      versionPrefixInput: "",
      versionPrefixConfig: "versionc-",
      expected: SemVer.fromString("versionc-1.2.3"),
    },
    {
      desc: "config and input prefix (input takes precedence)",
      versionPrefixInput: "versiona-",
      versionPrefixConfig: "versionb-",
      expected: SemVer.fromString("versiona-3.4.5"),
    },
    {
      desc: "non-matching config prefix",
      versionPrefixInput: "",
      versionPrefixConfig: "versiond-",
      expected: null,
    },
  ];

  beforeEach(() => {
    jest.spyOn(fs, "existsSync").mockReturnValue(true);
    jest.spyOn(github, "getAllTags").mockResolvedValue(TEST_VERSIONS);
  });

  test.each(versionPrefixTests)(
    "$desc",
    async ({ versionPrefixInput, versionPrefixConfig, expected }) => {
      jest.spyOn(core, "getInput").mockImplementation((setting, options?) => {
        switch (setting) {
          case "version-prefix":
            return versionPrefixInput ?? "*";
        }
        return "";
      });

      jest
        .spyOn(fs, "readFileSync")
        .mockReturnValue(
          `version-scheme: "semver"` +
            (versionPrefixConfig
              ? `\nversion-prefix: ${versionPrefixConfig}`
              : "")
        );

      await bumpaction.run();

      const commitSha =
        TEST_VERSIONS.find(version => version.name == expected?.toString())
          ?.sha ?? "dummy";

      // We specifically test the matcher function passed to matchTagsToCommits here,
      // as it's (sadly) the only way to test the actual behavior of the matcher.
      const matcherFunc = (github.matchTagsToCommits as jest.Mock).mock
        .calls[0][1];
      expect(matcherFunc(commitSha)).toEqual(expected);
    }
  );
});

describe("Process Commits Configuration", () => {
  beforeEach(() => {
    jest.spyOn(github, "getAllTags").mockResolvedValue([
      {
        name: "1.0.0",
        ref: `refs/tags/1.0.0`,
        sha: BASE_COMMIT.sha,
      },
    ] as IGitTag[]);

    jest
      .spyOn(github, "matchTagsToCommits")
      .mockResolvedValue([SemVer.fromString("1.0.0"), [BASE_COMMIT]]);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test("Disable C014 and C019 during bump", async () => {
    const processCommits = jest.spyOn(validate, "processCommits");

    const config = new Configuration();
    await getVersionBumpTypeAndMessages("f00dcafe", config);

    // Both C014 and C019 are disabled when running bump
    const expectedConfig = new Configuration();
    expectedConfig.setRuleActive("C014", false);
    expectedConfig.setRuleActive("C019", false);

    expect(processCommits).toHaveBeenCalledWith([BASE_COMMIT], expectedConfig);
    expect(config).toStrictEqual(new Configuration());

    processCommits.mockRestore();
  });

  test("All rules already disabled", async () => {
    const processCommits = jest.spyOn(validate, "processCommits");

    const config = new Configuration();
    ALL_RULES.forEach(rule => config.setRuleActive(rule.id, false));

    await getVersionBumpTypeAndMessages("f00dcafe", config);

    const expectedConfig = new Configuration();
    ALL_RULES.forEach(rule => expectedConfig.setRuleActive(rule.id, false));

    expect(processCommits).toHaveBeenCalledWith([BASE_COMMIT], config);
    expect(config).toStrictEqual(expectedConfig);

    processCommits.mockRestore();
  });
});
