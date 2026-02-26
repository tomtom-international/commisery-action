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

import * as fs from "fs";
import { SemVer } from "../src/semver";
import * as U from "./test_utils";
import { IGitHubRelease, IGitTag, IVersionOutput } from "../src/interfaces";

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

const CONFIG_SDKVER = `version-scheme: "sdkver"\nprereleases: "dev"`;

const setInputSpyWith = (a: { [b: string]: string }): void => {
  jest.spyOn(core, "getInput").mockImplementation((setting, options?) => {
    if (a[setting]) return a[setting];
    switch (setting) {
      case "version-scheme":
        return "";
      case "version-prefix":
        return "";
      case "config":
        return ".commisery.yml";
      case "build-metadata":
        return "";
    }
    throw new Error(`getInput("${setting}") not mocked`);
  });
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(github, "isPullRequestEvent").mockReturnValue(false);
  jest.spyOn(github, "createTag").mockResolvedValue(undefined);
  jest.spyOn(github, "createRelease").mockResolvedValue(undefined);
  jest.spyOn(github, "getCommitsBetweenRefs").mockResolvedValue([]);

  const releaseTypeInput = core.getInput("release-type");
  jest.spyOn(core, "getBooleanInput").mockImplementation(U.mockGetBooleanInput);

  jest
    .spyOn(changelog, "generateChangelog")
    .mockResolvedValue(U.CHANGELOG_PLACEHOLDER);
  jest
    .spyOn(changelog, "generateChangelogForCommits")
    .mockResolvedValue(U.CHANGELOG_PLACEHOLDER);

  jest.spyOn(github, "getAllTags").mockResolvedValue([
    {
      name: U.INITIAL_VERSION,
      ref: `refs/tags/${U.INITIAL_VERSION}`,
      sha: U.BASE_COMMIT.sha,
    },
  ]);
  jest.spyOn(github, "getPullRequestTitle").mockResolvedValue(U.PRTITLE("ci"));
  jest
    .spyOn(github, "matchTagsToCommits")
    .mockResolvedValue([
      SemVer.fromString(U.INITIAL_VERSION),
      U.DEFAULT_COMMIT_LIST,
    ]);
  const MOCKLOG = 0;
  if (MOCKLOG) {
    jest.spyOn(core, "debug").mockImplementation(console.log);
    jest.spyOn(core, "info").mockImplementation(console.log);
    jest.spyOn(core, "warning").mockImplementation(console.log);
    jest.spyOn(core, "error").mockImplementation(console.log);
    jest.spyOn(core, "setFailed").mockImplementation(console.log);
  }

  jest.spyOn(fs, "existsSync").mockReturnValue(true);
  jest.spyOn(fs, "readFileSync").mockReturnValue(CONFIG_SDKVER);
});

interface SdkBumpTestParameters {
  testDescription: string;
  initialVersion: string;
  bumpType: string;
  latestDraftRelease: string;
  branch: string;
  breaking: boolean;
  expectedVersion: string;
  expectedBumpType: string;
  initialDevelopment: boolean;
  maxMajor: number;
}
const generateTests = (paramListList: any): SdkBumpTestParameters[] => {
  let testList = new Array() as SdkBumpTestParameters[];
  for (const paramList of paramListList) {
    testList.push({
      testDescription: paramList[0],
      initialVersion: paramList[1],
      bumpType: paramList[2],
      latestDraftRelease: paramList[3],
      branch: paramList[4],
      breaking: paramList[5] as any as boolean,
      expectedVersion: paramList[6],
      expectedBumpType: paramList[7],
      initialDevelopment: paramList[8],
      maxMajor: paramList[9],
    });
  }
  return testList;
};

const testFunction = async (p: SdkBumpTestParameters) => {
  const release: IGitHubRelease = {
    name: p.expectedVersion,
    id: 123456,
    draft: p.expectedBumpType === "dev",
    prerelease: ["rc", "dev"].includes(p.expectedBumpType),
  };
  const tag: IGitTag = {
    name: p.expectedVersion,
    ref: `refs/tags/${p.expectedVersion}`,
    sha: U.HEAD_SHA,
  };
  jest.spyOn(github, "createRelease").mockResolvedValue(release);
  jest.spyOn(github, "createTag").mockResolvedValue(tag);

  const messages = (p.breaking ? [U.MAJOR_MSG] : []).concat(
    U.DEFAULT_COMMIT_LIST
  );
  const prTitle = U.PRTITLE("chore");
  jest
    .spyOn(fs, "readFileSync")
    .mockReturnValue(
      `version-scheme: "sdkver"\ninitial-development: ${p.initialDevelopment}\nsdkver-max-major: ${p.maxMajor}`
    );
  setInputSpyWith({ "release-type": p.bumpType });
  jest.spyOn(github, "getAllTags").mockResolvedValue([
    {
      name: p.initialVersion,
      ref: `refs/tags/${p.initialVersion}`,
      sha: U.BASE_COMMIT.sha,
    },
  ]);
  jest
    .spyOn(github, "currentHeadMatchesTag")
    .mockResolvedValue(p.testDescription.includes("HEADisTag"));
  jest
    .spyOn(github, "getRelease")
    .mockResolvedValue(
      p.latestDraftRelease ? { id: 1, name: p.latestDraftRelease } : undefined
    );
  gh.context.ref = `refs/heads/${p.branch}`;

  jest.spyOn(github, "getPullRequestTitle").mockResolvedValue(prTitle);
  jest
    .spyOn(github, "matchTagsToCommits")
    .mockResolvedValue([SemVer.fromString(p.initialVersion), messages]);

  await bumpaction.run();
  expect(core.info).toHaveBeenCalledWith(
    expect.stringContaining(`Found SdkVer tag: ${p.initialVersion}`)
  );
  expect(github.createTag).not.toHaveBeenCalled();
  if (p.expectedVersion) {
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining(`Current version: ${p.initialVersion}`)
    );
    expect(github.createRelease).toHaveBeenCalledTimes(1);
    expect(github.createRelease).toHaveBeenCalledWith(
      p.expectedVersion,
      U.HEAD_SHA,
      U.CHANGELOG_PLACEHOLDER,
      p.expectedVersion.includes("-dev"), // draft
      p.expectedVersion.includes("-rc"), // prerelease
      undefined
    );

    expect(core.setOutput).toHaveBeenCalledWith(
      "current-version",
      p.initialVersion
    );

    expect(core.setOutput).toHaveBeenCalledWith(
      "next-version",
      p.expectedVersion
    );

    expect(core.setOutput).toHaveBeenCalledWith(
      "bump-metadata",
      JSON.stringify({
        bump: {
          from: p.initialVersion,
          to: p.expectedVersion,
          type: p.expectedBumpType,
        },
        tag,
        release,
      } as IVersionOutput)
    );

    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  } else {
    expect(core.setOutput).toHaveBeenCalledWith(
      "current-version",
      p.initialVersion
    );

    expect(core.setOutput).toHaveBeenCalledWith("next-version", "");
    expect(core.setOutput).toHaveBeenCalledWith("bump-metadata", "");

    if (p.testDescription.includes("HEADisTag")) {
      expect(core.setFailed).not.toHaveBeenCalled();
      expect(github.createRelease).not.toHaveBeenCalled();
    } else {
      // Expect error
      expect(core.setFailed).toHaveBeenCalledTimes(1);
    }
  }
  expect(core.setOutput).toHaveBeenCalledWith(
    "current-version",
    p.initialVersion
  );
};

// prettier-ignore
const testSuiteDefinitions = [
  // GENERAL BUMPING  o7
  {
    suite: "Dev bumps on main branch",
    tests: [
     // [ test description     , version      ,  bump  , latest draft       , branch         , breaking?, expected version                        , expected bump  , initial development?, max major version ]
        ["from dev-draft-nopad", "1.1.0"      , "dev"  , "1.2.0-dev1+abc12" , "master"       , false    , `1.2.0-dev002.${U.HEAD_SHA_ABBREV_8}`   , "dev"          , false               , 0                 ],
        ["from long-pad-dev"   , "1.1.0"      , "dev"  , "1.2.0-dev00001+ab", "master"       , false    , `1.2.0-dev00002.${U.HEAD_SHA_ABBREV_8}` , "dev"          , false               , 0                 ],
        ["from dev-draft-init" , "0.1.0"      , "dev"  , "0.2.0-dev001.123" , "master"       , false    , `0.2.0-dev002.${U.HEAD_SHA_ABBREV_8}`   , "dev"          , true                , 0                 ],
        ["from dev-draft"      , "1.1.0"      , "dev"  , "1.2.0-dev001.123" , "master"       , false    , `1.2.0-dev002.${U.HEAD_SHA_ABBREV_8}`   , "dev"          , false               , 0                 ],
        ["from dev-init"       , "0.1.0"      , "dev"  , undefined          , "master"       , false    , `0.2.0-dev001.${U.HEAD_SHA_ABBREV_8}`   , "dev"          , true                , 0                 ],
        ["from dev"            , "1.1.0"      , "dev"  , undefined          , "master"       , false    , `1.2.0-dev001.${U.HEAD_SHA_ABBREV_8}`   , "dev"          , false               , 0                 ],
        ["from rc"             , "1.2.0-rc01" , "dev"  , undefined          , "master"       , false    , `1.3.0-dev001.${U.HEAD_SHA_ABBREV_8}`   , "dev"          , false               , 0                 ],
        ["from release"        , "1.2.0"      , "dev"  , undefined          , "master"       , false    , `1.3.0-dev001.${U.HEAD_SHA_ABBREV_8}`   , "dev"          , false               , 0                 ],
    ],
  },
  {
    suite: "Dev bumps on release branch",
    tests: [
     // [ test description      , version      ,  bump  , latest draft       , branch         , breaking?, expected version , expected bump , initial development?, max major version ]
        ["from dev init"        , "0.1.0"      , "dev"  , "0.2.0-dev001.234" , "release/0.2.0", false    , "0.1.1"          , "rel"         , true                , 0                 ], // <-- note that the branch name
        ["from dev"             , "1.1.0"      , "dev"  , "1.2.0-dev001.234" , "release/1.2.0", false    , "1.1.1"          , "rel"         , false               , 0                 ], //     is not considered as any
        ["from rc nopad"        , "1.2.0-rc1"  , "dev"  , "1.2.0-dev001.345" , "release/1.2.0", false    , "1.2.0-rc02"     , "rc"          , false               , 0                 ], //     sort of versioning input
        ["from rc"              , "1.2.0-rc01" , "dev"  , "1.2.0-dev001.345" , "release/1.2.0", false    , "1.2.0-rc02"     , "rc"          , false               , 0                 ],
        ["from release"         , "1.2.0"      , "dev"  , undefined          , "release/1.2.0", false    , "1.2.1"          , "rel"         , false               , 0                 ],
        ["from rel + HEADisTag" , "1.2.0"      , "dev"  , undefined          , "release/1.2.0", false    , undefined        , ""            , false               , 0                 ],
    ],
  },
  {
    suite: "Release candidate bumps on main branch",
    tests: [
     // [ test description      , version      ,  bump  , latest draft       , branch           , breaking?, expected version , expected bump , initial development?, max major version ]  //     may be non-intuitive; rc
        ["from dev"             , "1.1.0"      , "rc"   , "1.2.0-dev001.1"   , "master"         , false    , "1.2.0-rc01"     , "rc"          , false               , 0                 ], //     increments only happen on
        ["from rc"              , "1.2.0-rc01" , "rc"   , "1.2.0-dev001.2"   , "master"         , false    , "1.3.0-rc01"     , "rc"          , false               , 0                 ], // <-- rel. branches, so this is
        ["from release"         , "1.2.0"      , "rc"   , "1.2.0-dev001.3"   , "master"         , false    , "1.3.0-rc01"     , "rc"          , false               , 0                 ], //     the _next_ release
    ],
  },
  {
    suite: "Release candidate bumps on release branch",
    tests: [
     // [ test description      , version      ,  bump  , latest draft       , branch         , breaking?, expected version , expected bump , initial development?, max major version ]
        ["from dev"             , "1.1.0"      , "rc"   , "1.2.0-dev001.1"   , "release/1.2.0", false    , "1.1.1"          , "rel"         , false               , 0                 ],
        ["from rc"              , "1.2.0-rc01" , "rc"   , "1.2.0-dev001.2"   , "release/1.2.0", false    , "1.2.0-rc02"     , "rc"          , false               , 0                 ],
        ["from rc + HEADisTag"  , "1.2.0-rc01" , "rc"   , "1.2.0-dev001.3"   , "release/1.2.0", false    , undefined        , ""            , false               , 0                 ],
        ["from release"         , "1.2.0"      , "rc"   , "1.2.0-dev001.4"   , "release/1.2.0", false    , "1.2.1"          , "rel"         , false               , 0                 ],
    ],
  },
  {
    suite: "Release bumps on main branch",
    tests: [
     // [ test description      , version      ,  bump  , latest draft       , branch         , breaking? , expected version , expected bump , initial development?, max major version ]
        ["from dev"             , "1.1.0"      , "rel"  , "1.2.0-dev001.1"   , "master"       , false     , "1.2.0"          , "rel"         , false               , 0                 ],
        ["from rc + HEADisTag"  , "1.2.0-rc01" , "rel"  , "1.2.0-dev001.1"   , "master"       , false     , "1.2.0"          , "rel"         , false               , 0                 ], // note that "HEADisTag" triggers specialized behavior
        ["from rc + HEADisnoTag", "1.2.0-rc01" , "rel"  , "1.2.0-dev001.1"   , "master"       , false     , "1.3.0"          , "rel"         , false               , 0                 ],
        ["from release"         , "1.2.0"      , "rel"  , "1.2.0-dev001.1"   , "master"       , false     , "1.3.0"          , "rel"         , false               , 0                 ],
    ],
  },
  {
    suite: "Release bumps on release branch",
    tests: [
     // [ test description      , version      ,  bump  , latest draft     , branch         , breaking?, expected version , expected bump , initial development?, max major version ]
        ["from dev"             , "1.1.0"      , "rel"  , "1.2.0-dev001.1" , "release/1.2.0", false    , "1.1.1"          , "rel"         , false               , 0                 ],
        ["from rc"              , "1.2.0-rc01" , "rel"  , "1.2.0-dev001.1" , "release/1.2.0", false    , "1.2.0"          , "rel"         , false               , 0                 ],
        ["from release"         , "1.2.0"      , "rel"  , "1.2.0-dev001.1" , "release/1.2.0", false    , "1.2.1"          , "rel"         , false               , 0                 ],
        ["from rel + HEADisTag" , "1.2.0"      , "rel"  , undefined        , "release/1.2.0", false    , undefined        , ""            , false               , 0                 ],
    ],
  },
  // BREAKING CHANGES
  {
    suite: "Dev bumps with breaking changes",
    tests: [
     // [ test description        , version      ,  bump  , latest draft     , branch         , breaking?, expected version                     , expected bump , initial development?, max major version ]
        ["main branch, init"      , "0.2.0"      , "dev"  , undefined        , "master"       , true     , `0.3.0-dev001.${U.HEAD_SHA_ABBREV_8}`, "dev"         , true                , 0                 ],
        ["main branch, no init"   , "0.2.0"      , "dev"  , undefined        , "master"       , true     , `1.0.0-dev001.${U.HEAD_SHA_ABBREV_8}`, "dev"         , false               , 0                 ],
        ["main branch, max"       , "1.2.0"      , "dev"  , undefined        , "master"       , true     , `1.3.0-dev001.${U.HEAD_SHA_ABBREV_8}`, "dev"         , false               , 1                 ],
        ["main branch, max2"      , "1.2.0"      , "dev"  , undefined        , "master"       , true     , `2.0.0-dev001.${U.HEAD_SHA_ABBREV_8}`, "dev"         , false               , 2                 ],
        ["main branch"            , "1.2.0"      , "dev"  , undefined        , "master"       , true     , `2.0.0-dev001.${U.HEAD_SHA_ABBREV_8}`, "dev"         , false               , 0                 ],
        ["main branch, draft init", "0.2.0"      , "dev"  , "0.3.0-dev001.2" , "master"       , true     , `0.3.0-dev002.${U.HEAD_SHA_ABBREV_8}`, "dev"         , true                , 0                 ],
        ["main branch, draft max" , "1.2.0"      , "dev"  , "1.3.0-dev001.2" , "master"       , true     , `1.3.0-dev002.${U.HEAD_SHA_ABBREV_8}`, "dev"         , false               , 1                 ],
        ["main branch, draft"     , "1.2.0"      , "dev"  , "1.3.0-dev001.2" , "master"       , true     , `1.3.0-dev002.${U.HEAD_SHA_ABBREV_8}`, "dev"         , false               , 0                 ],
        ["release branch"         , "1.2.0"      , "dev"  , undefined        , "release/1.2.0", true     , undefined                            , ""            , false               , 0                 ],
        ["release branch, draft"  , "1.2.0"      , "dev"  , "1.3.0-dev001.3" , "release/1.2.0", true     , undefined                            , ""            , false               , 0                 ],
        ["release branch+RC"      , "1.2.0-rc01" , "dev"  , undefined        , "release/1.2.0", true     , undefined                            , ""            , false               , 0                 ],
        ["rel branch+RC, draft"   , "1.2.0-rc01" , "dev"  , "1.3.0-dev001.3" , "release/1.2.0", true     , undefined                            , ""            , false               , 0                 ],
    ],
  },
  {
    suite: "Rc bumps with breaking changes",
    tests: [
     // [ test description      , version      ,  bump  , latest draft , branch         , breaking?, expected version , expected bump , initial development?, max major version ]
        ["main branch, init"    , "0.2.0"      , "rc"   , undefined    , "master"       , true     , "0.3.0-rc01"     , "rc"          , true                , 0                 ],
        ["main branch, no init" , "0.2.0"      , "rc"   , undefined    , "master"       , true     , "1.0.0-rc01"     , "rc"          , false               , 0                 ],
        ["main branch, max"     , "1.2.0"      , "rc"   , undefined    , "master"       , true     , "1.3.0-rc01"     , "rc"          , false               , 1                 ],
        ["main branch, max2"    , "1.2.0"      , "rc"   , undefined    , "master"       , true     , "2.0.0-rc01"     , "rc"          , false               , 2                 ],
        ["main branch"          , "1.2.0"      , "rc"   , undefined    , "master"       , true     , "2.0.0-rc01"     , "rc"          , false               , 0                 ],
        ["main branch+RC"       , "1.2.0-rc01" , "rc"   , undefined    , "master"       , true     , "2.0.0-rc01"     , "rc"          , false               , 0                 ],
        ["release branch"       , "1.2.0"      , "rc"   , undefined    , "release/1.2.0", true     , undefined        , ""            , false               , 0                 ],
        ["release branch+RC"    , "1.2.0-rc01" , "rc"   , undefined    , "release/1.2.0", true     , undefined        , ""            , false               , 0                 ],
        ["RB+ RC for next major", "2.0.0-rc01" , "dev"  , undefined    , "release/2.0.0", true     , "2.0.0-rc02"     , "rc"          , false               , 0                 ],
    ],
  },
  {
    suite: "Release bumps with breaking changes",
    tests: [
     // [ test description      , version      ,  bump  , latest draft , branch         , breaking?, expected version, expected bump , initial development?, max major version ]
        ["main branch, init"    , "0.2.0"      , "rel"  , undefined    , "master"       , true     , "0.3.0"         , "rel"          , true                , 0                 ],
        ["main branch, no init" , "0.2.0"      , "rel"  , undefined    , "master"       , true     , "1.0.0"         , "rel"          , false               , 0                 ],
        ["main branch, max"     , "1.2.0"      , "rel"  , undefined    , "master"       , true     , "1.3.0"         , "rel"          , false               , 1                 ],
        ["main branch, max2"    , "1.2.0"      , "rel"  , undefined    , "master"       , true     , "2.0.0"         , "rel"          , false               , 2                 ],
        ["main branch"          , "1.2.0"      , "rel"  , undefined    , "master"       , true     , "2.0.0"         , "rel"          , false               , 0                 ],
        ["release branch"       , "1.2.0"      , "rel"  , undefined    , "release/1.2.0", true     , undefined       , ""             , false               , 0                 ],
        ["release branch+RC"    , "1.2.0-rc01" , "rel"  , undefined    , "release/1.2.0", true     , undefined       , ""             , false               , 0                 ],
    ],
  },
  // DRAFT RELEASE HANDLING
  {
    suite: "Dev bumps considers draft releases",
    tests: [
     // [ test description      , version     ,  bump  , latest draft , branch          , breaking?, expected version                      , expected bump , initial development?, max major version ]
        ["no draft"             , "1.2.0"     , "dev"  , undefined    , "master"        , false    , `1.3.0-dev001.${U.HEAD_SHA_ABBREV_8}` , "dev"         , false               , 0                 ],
        ["previous version"     , "1.2.0"     , "dev"  , "1.1.0-dev034", "master"       , false    , `1.3.0-dev001.${U.HEAD_SHA_ABBREV_8}` , "dev"         , false               , 0                 ],
        ["current version"      , "1.2.0"     , "dev"  , "1.2.0-dev023", "master"       , false    , `1.3.0-dev001.${U.HEAD_SHA_ABBREV_8}` , "dev"         , false               , 0                 ],
        ["next version"         , "1.2.0"     , "dev"  , "1.3.0-dev019", "master"       , false    , `1.3.0-dev020.${U.HEAD_SHA_ABBREV_8}` , "dev"         , false               , 0                 ],
        ["next major"           , "1.2.0"     , "dev"  , "2.0.0-dev011", "master"       , false    , `2.0.0-dev012.${U.HEAD_SHA_ABBREV_8}` , "dev"         , false               , 0                 ],
    ],
  },
  {
    suite: "Release candidate bumps ignore draft releases",
    tests: [
     // [ test description      , version     ,  bump  , latest draft  , branch         , breaking?, expected version, expected bump , initial development?, max major version ]
        ["mb: no draft"         , "1.2.0"     , "rc"   , undefined     , "master"       , false    , "1.3.0-rc01"    , "rc"          , false               , 0                 ],
        ["mb: previous version" , "1.2.0"     , "rc"   , "1.1.0-dev034", "master"       , true     , "2.0.0-rc01"    , "rc"          , false               , 0                 ],
        ["mb: current version"  , "1.2.0"     , "rc"   , "1.2.0-dev023", "master"       , false    , "1.3.0-rc01"    , "rc"          , false               , 0                 ],
        ["mb: next version"     , "1.2.0"     , "rc"   , "1.3.0-dev019", "master"       , false    , "1.3.0-rc01"    , "rc"          , false               , 0                 ],
        ["rb: no draft"         , "1.2.0"     , "rc"   , undefined     , "release/1.2.0", false    , "1.2.1"         , "rel"         , false               , 0                 ],
        ["rb: previous version" , "1.2.0"     , "rc"   , "1.1.0-dev034", "release/1.2.0", false    , "1.2.1"         , "rel"         , false               , 0                 ],
        ["rb: current version"  , "1.2.0"     , "rc"   , "1.2.0-dev023", "release/1.2.0", false    , "1.2.1"         , "rel"         , false               , 0                 ],
        ["rb: next version"     , "1.2.0"     , "rc"   , "1.3.0-dev019", "release/1.2.0", false    , "1.2.1"         , "rel"         , false               , 0                 ],
    ],
  },
  // MISCELLANEOUS ERRORS
  {
    suite: "Erroneous situations",
    tests: [
     // [ test description      , version         ,  bump  , latest draft     , branch         , breaking?, expected version                      , expected bump , initial development?, max major version ]
        ["rel branch major bump", "1.2.0"         , "dev"  , undefined        , "release/1.2.0", true     , undefined                             , ""            , false               , 0                 ],
        ["rel branch cur dev"   , `1.1.0-dev008.1`, "dev"  , "1.2.0-dev001+1" , "release/1.2.0", false    , undefined                             , ""            , false               , 0                 ],
        ["incorrect prerelease" , `1.1.0-devs`    , "dev"  , undefined        , "master"       , false    , `1.2.0-dev001.${U.HEAD_SHA_ABBREV_8}` , "dev"         , false               , 0                 ],
        ["wrong bump input"     , `1.1.0-dev001.3`, "beep" , undefined        , "master"       , false    , undefined                             , ""            , false               , 0                 ],
        ["unauth'd branch dev"  , `1.1.0-dev001.4`, "dev"  , undefined        , "mister"       , false    , `1.1.0-dev002.${U.HEAD_SHA_ABBREV_8}` , "dev"         , false               , 0                 ], // <-- TODO: make fail; not
        ["unauth'd branch rc"   , `1.1.0-dev001.5`, "rc"   , undefined        , "mister"       , false    , "1.1.0-rc01"                          , "rc"          , false               , 0                 ], // <--       implemented yet
    ],
  },
];

for (const definition of testSuiteDefinitions) {
  describe(definition.suite, () => {
    test.each(generateTests(definition.tests))(
      "$testDescription",
      testFunction
    );
  });
}

describe("Create release branch", () => {
  beforeEach(() => {
    jest.spyOn(fs, "existsSync").mockReturnValue(true);
    jest
      .spyOn(fs, "readFileSync")
      .mockReturnValue(
        `version-scheme: "sdkver"\nsdkver-create-release-branches: true`
      );
    setInputSpyWith({ "release-type": "rc" });
    jest.spyOn(github, "createRelease").mockResolvedValue({
      name: U.MINOR_BUMPED_VERSION,
      id: 123456,
      draft: false,
      prerelease: false,
    });
  });

  test.each([
    ["main", "rel"],
    ["main", "rc"],
    ["main", "dev"],
    ["release/1.3", "rel"],
    ["release/1.3", "rc"],
    ["release/1.3", "dev"],
  ])("branch '%s', bump '%s'", async (branch, bumpType) => {
    gh.context.ref = `refs/heads/${branch}`;
    setInputSpyWith({ "release-type": bumpType });

    await bumpaction.run();

    if (branch === "main" && ["rel", "rc"].includes(bumpType)) {
      expect(github.createBranch).toHaveBeenCalledWith(
        "refs/heads/release/1.3",
        U.HEAD_SHA
      );
    } else {
      expect(github.createBranch).not.toHaveBeenCalled();
    }
  });

  it("should be default disabled", async () => {
    gh.context.ref = "refs/heads/main";
    jest.spyOn(fs, "readFileSync").mockReturnValue(`version-scheme: "sdkver"`);

    jest.spyOn(github, "createRelease").mockResolvedValue({
      name: U.MINOR_BUMPED_VERSION,
      id: 123456,
      draft: false,
      prerelease: false,
    });

    await bumpaction.run();
    expect(github.createBranch).not.toHaveBeenCalled();
  });

  it("uses the default branch prefix when boolean 'true' is configured", async () => {
    gh.context.ref = "refs/heads/main";
    jest
      .spyOn(fs, "readFileSync")
      .mockReturnValue(
        `version-scheme: "sdkver"\nsdkver-create-release-branches: true`
      );

    jest.spyOn(github, "createRelease").mockResolvedValue({
      name: U.MINOR_BUMPED_VERSION,
      id: 123456,
      draft: false,
      prerelease: false,
    });

    await bumpaction.run();
    expect(github.createBranch).toHaveBeenCalledWith(
      "refs/heads/release/1.3",
      "baaaadb0b"
    );
  });

  it("correctly uses string configuration values as branch prefix", async () => {
    gh.context.ref = "refs/heads/main";

    jest
      .spyOn(fs, "readFileSync")
      .mockReturnValue(
        `version-scheme: "sdkver"\nsdkver-create-release-branches: "rel-"`
      );

    jest.spyOn(github, "createRelease").mockResolvedValue({
      name: U.MINOR_BUMPED_VERSION,
      id: 123456,
      draft: false,
      prerelease: false,
    });

    await bumpaction.run();
    expect(github.createBranch).toHaveBeenCalledWith(
      "refs/heads/rel-1.3",
      "baaaadb0b"
    );
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
    const release: IGitHubRelease = {
      name: U.MINOR_BUMPED_VERSION,
      id: 123456,
      draft: false,
      prerelease: false,
    };
    const tag: IGitTag = {
      name: U.MINOR_BUMPED_VERSION,
      ref: `refs/tags/${U.MINOR_BUMPED_VERSION}`,
      sha: U.HEAD_SHA,
    };

    jest.spyOn(github, "createRelease").mockResolvedValue(release);

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
    setInputSpyWith({ "release-type": "rel" });

    await bumpaction.run();
    if (createChangelog) {
      expect(changelog.generateChangelog).toHaveBeenCalledTimes(1);
      expect(github.createRelease).toHaveBeenCalledTimes(1);
      expect(github.createRelease).toHaveBeenCalledWith(
        U.MINOR_BUMPED_VERSION,
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
        U.MINOR_BUMPED_VERSION,
        U.HEAD_SHA,
        "",
        false,
        false,
        undefined
      );
    }

    expect(core.setOutput).toHaveBeenCalledWith(
      "next-version",
      U.MINOR_BUMPED_VERSION
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "bump-metadata",
      JSON.stringify({
        bump: {
          from: U.INITIAL_VERSION,
          to: U.MINOR_BUMPED_VERSION,
          type: "rel",
        },
        tag: tag,
        release: release,
      } as IVersionOutput)
    );
  });
});

afterAll(() => {
  jest.restoreAllMocks();
});
