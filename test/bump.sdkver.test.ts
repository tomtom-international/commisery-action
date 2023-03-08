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
import { Configuration } from "../src/config";

import * as fs from "fs";
import { SemVer } from "../src/semver";
import * as U from "./test_utils";
import { isReadable } from "stream";

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
      case "version-prefix":
        return "*";
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
  jest.spyOn(github, "createTag").mockResolvedValue();
  jest.spyOn(github, "createRelease").mockResolvedValue();

  const releaseTypeInput = core.getInput("release-type");
  jest.spyOn(core, "getBooleanInput").mockImplementation(U.mockGetBooleanInput);

  jest
    .spyOn(changelog, "generateChangelog")
    .mockResolvedValue(U.CHANGELOG_PLACEHOLDER);

  jest.spyOn(github, "getLatestTags").mockResolvedValue([
    {
      name: U.INITIAL_VERSION,
      commitSha: U.BASE_COMMIT.sha,
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
}
// prettier-ignore
const generateTests = (paramListList)
  : SdkBumpTestParameters[] => {
  let testList = new Array() as SdkBumpTestParameters[];
  for (const paramList of paramListList) {
    testList.push({
      testDescription: paramList[0],
      initialVersion: paramList[1],
      bumpType: paramList[2],
      latestDraftRelease: paramList[3],
      branch: paramList[4],
      breaking: paramList[5] as any as boolean,
      expectedVersion: paramList[6]
    })
  }
  return testList;
};

const testFunction = async (p: SdkBumpTestParameters) => {
  const messages = (p.breaking ? [U.MAJOR_MSG] : []).concat(
    U.DEFAULT_COMMIT_LIST
  );
  const prTitle = U.PRTITLE("chore");
  setInputSpyWith({ "release-type": p.bumpType });
  jest.spyOn(github, "getLatestTags").mockResolvedValue([
    {
      name: p.initialVersion,
      commitSha: U.BASE_COMMIT.sha,
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

  await bumpaction.exportedForTesting.run();
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
      p.expectedVersion.includes("-rc") // prerelease
    );
    expect(core.setOutput).toBeCalledWith("next-version", p.expectedVersion);
    expect(core.error).not.toHaveBeenCalled();
    expect(core.setFailed).not.toHaveBeenCalled();
  } else {
    // Expect error
    expect(core.setFailed).toHaveBeenCalledTimes(1);
  }
  expect(core.setOutput).toBeCalledWith("current-version", p.initialVersion);
};

// prettier-ignore
const testSuiteDefinitions = [
  // GENERAL BUMPING  o7
  {
    suite: "Dev bumps on main branch",
    tests: [
     // [ test description      , version     ,  bump  , latest draft , branch         , breaking?, expected version ]
        ["from dev"             , "1.1.0"     , "dev"  , "1.2.0-dev1" , "master"       , false    , "1.2.0-dev2"     ],
        ["from dev"             , "1.1.0"     , "dev"  , undefined    , "master"       , false    , "1.2.0-dev1"     ],
        ["from rc"              , "1.2.0-rc1" , "dev"  , undefined    , "master"       , false    , "1.3.0-dev1"     ],
        ["from release"         , "1.2.0"     , "dev"  , undefined    , "master"       , false    , "1.3.0-dev1"     ],
    ],
  },
  {
    suite: "Dev bumps on release branch",
    tests: [
     // [ test description      , version     ,  bump  , latest draft , branch         , breaking?, expected version ]
        ["from dev"             , "1.1.0"     , "dev"  , "1.2.0-dev1" , "release/1.2.0", false    , "1.1.1"          ], // <-- note that the branch name
        ["from rc"              , "1.2.0-rc1" , "dev"  , "1.2.0-dev1" , "release/1.2.0", false    , "1.2.0-rc2"      ], //     is not considered as any
        ["from release"         , "1.2.0"     , "dev"  , undefined    , "release/1.2.0", false    , "1.2.1"          ], //     sort of versioning input
    ],
  },
  {
    suite: "Release candidate bumps on main branch",
    tests: [
     // [ test description      , version     ,  bump  , latest draft , branch         , breaking?, expected version ]  //     may be non-intuitive; rc
        ["from dev"             , "1.1.0"     , "rc"   , "1.2.0-dev1" , "master"       , false    , "1.2.0-rc1"      ], //     increments only happen on
        ["from rc"              , "1.2.0-rc1" , "rc"   , "1.2.0-dev1" , "master"       , false    , "1.3.0-rc1"      ], // <-- rel. branches, so this is
        ["from release"         , "1.2.0"     , "rc"   , "1.2.0-dev1" , "master"       , false    , "1.3.0-rc1"      ], //     the _next_ release
    ],
  },
  {
    suite: "Release candidate bumps on release branch",
    tests: [
     // [ test description      , version     ,  bump  , latest draft , branch         , breaking?, expected version ]
        ["from dev"             , "1.1.0"     , "rc"   , "1.2.0-dev1" , "release/1.2.0", false    , "1.1.1"          ],
        ["from rc"              , "1.2.0-rc1" , "rc"   , "1.2.0-dev1" , "release/1.2.0", false    , "1.2.0-rc2"      ],
        ["from release"         , "1.2.0"     , "rc"   , "1.2.0-dev1" , "release/1.2.0", false    , "1.2.1"          ],
    ],
  },
  {
    suite: "Release bumps on main branch",
    tests: [
     // [ test description      , version     ,  bump  , latest draft , branch         , breaking?, expected version ]
        ["from dev"             , "1.1.0"     , "rel"  , "1.2.0-dev1" , "master"       , false    , "1.2.0"          ],
        ["from rc + HEADisTag"  , "1.2.0-rc1" , "rel"  , "1.2.0-dev1" , "master"       , false    , "1.2.0"          ], // note that "HEADisTag" triggers specialized behavior
        ["from rc + HEADisnoTag", "1.2.0-rc1" , "rel"  , "1.2.0-dev1" , "master"       , false    , "1.3.0"          ],
        ["from release"         , "1.2.0"     , "rel"  , "1.2.0-dev1" , "master"       , false    , "1.3.0"          ],
    ],
  },
  {
    suite: "Release bumps on release branch",
    tests: [
     // [ test description      , version     ,  bump  , latest draft , branch         , breaking?, expected version ]
        ["from dev"             , "1.1.0"     , "rel"  , "1.2.0-dev1" , "release/1.2.0", false    , "1.1.1"          ],
        ["from rc"              , "1.2.0-rc1" , "rel"  , "1.2.0-dev1" , "release/1.2.0", false    , "1.2.0"          ],
        ["from release"         , "1.2.0"     , "rel"  , "1.2.0-dev1" , "release/1.2.0", false    , "1.2.1"          ],
    ],
  },
  // BREAKING CHANGES
  {
    suite: "Dev bumps with breaking changes",
    tests: [
     // [ test description      , version     ,  bump  , latest draft , branch         , breaking?, expected version ]
        ["main branch"          , "1.2.0"     , "dev"  , undefined    , "master"       , true    , "2.0.0-dev1"      ],
        ["main branch, draft"   , "1.2.0"     , "dev"  , "1.3.0-dev1" , "master"       , true    , "2.0.0-dev1"      ],
        ["release branch"       , "1.2.0"     , "dev"  , undefined    , "release/1.2.0", true    , undefined         ],
        ["release branch, draft", "1.2.0"     , "dev"  , "1.3.0-dev1" , "release/1.2.0", true    , undefined         ],
        ["release branch+RC"    , "1.2.0-rc1" , "dev"  , undefined    , "release/1.2.0", true    , undefined         ],
        ["rel branch+RC, draft" , "1.2.0-rc1" , "dev"  , "1.3.0-dev1" , "release/1.2.0", true    , undefined         ],
    ],
  },
  {
    suite: "Rc bumps with breaking changes",
    tests: [
     // [ test description      , version     ,  bump  , latest draft , branch         , breaking?, expected version ]
        ["main branch"          , "1.2.0"     , "rc"   , undefined    , "master"       , true    , "2.0.0-rc1"       ],
        ["main branch+RC"       , "1.2.0-rc1" , "rc"   , undefined    , "master"       , true    , "2.0.0-rc1"       ],
        ["release branch"       , "1.2.0"     , "rc"   , undefined    , "release/1.2.0", true    , undefined         ],
        ["release branch+RC"    , "1.2.0-rc1" , "rc"   , undefined    , "release/1.2.0", true    , undefined         ],
        ["RB+ RC for next major", "2.0.0-rc1" , "dev"  , undefined    , "release/2.0.0", true    , "2.0.0-rc2"       ],
    ],
  },
  {
    suite: "Release bumps with breaking changes",
    tests: [
     // [ test description      , version     ,  bump  , latest draft , branch         , breaking?, expected version ]
        ["main branch"          , "1.2.0"     , "rel"  , undefined    , "master"       , true    , "2.0.0"           ],
        ["release branch"       , "1.2.0"     , "rel"  , undefined    , "release/1.2.0", true    , undefined         ],
        ["release branch+RC"    , "1.2.0-rc1" , "rel"  , undefined    , "release/1.2.0", true    , undefined         ],
    ],
  },
  // DRAFT RELEASE HANDLING
  {
    suite: "Dev bumps considers draft releases",
    tests: [
     // [ test description      , version     ,  bump  , latest draft , branch         , breaking?, expected version ]
        ["no draft"             , "1.2.0"     , "dev"  , undefined    , "master"       , false    , "1.3.0-dev1"     ],
        ["previous version"     , "1.2.0"     , "dev"  , "1.1.0-dev34", "master"       , false    , "1.3.0-dev1"     ],
        ["current version"      , "1.2.0"     , "dev"  , "1.2.0-dev23", "master"       , false    , "1.3.0-dev1"     ], //     TODO: this test result
        ["next version"         , "1.2.0"     , "dev"  , "1.3.0-dev19", "master"       , false    , "1.3.0-dev20"    ], //           is misleading due to
        ["next major"           , "1.2.0"     , "dev"  , "2.0.0-dev11", "master"       , false    , "2.0.0-dev12"    ], // <--       a mock!
    ],
  },
  {
    suite: "Release candidate bumps ignore draft releases",
    tests: [
     // [ test description      , version     ,  bump  , latest draft , branch         , breaking?, expected version ]
        ["mb: no draft"         , "1.2.0"     , "rc"   , undefined    , "master"       , false    , "1.3.0-rc1"      ],
        ["mb: previous version" , "1.2.0"     , "rc"   , "1.1.0-dev34", "master"       , true     , "2.0.0-rc1"      ],
        ["mb: current version"  , "1.2.0"     , "rc"   , "1.2.0-dev23", "master"       , false    , "1.3.0-rc1"      ], 
        ["mb: next version"     , "1.2.0"     , "rc"   , "1.3.0-dev19", "master"       , false    , "1.3.0-rc1"      ],
        ["rb: no draft"         , "1.2.0"     , "rc"   , undefined    , "release/1.2.0", false    , "1.2.1"          ],
        ["rb: previous version" , "1.2.0"     , "rc"   , "1.1.0-dev34", "release/1.2.0", false    , "1.2.1"          ],
        ["rb: current version"  , "1.2.0"     , "rc"   , "1.2.0-dev23", "release/1.2.0", false    , "1.2.1"          ],
        ["rb: next version"     , "1.2.0"     , "rc"   , "1.3.0-dev19", "release/1.2.0", false    , "1.2.1"          ],
    ],
  },
  // MISCELLANEOUS ERRORS
  {
    suite: "Erroneous situations",
    tests: [
     // [ test description      , version     ,  bump  , latest draft , branch         , breaking?, expected version ]
        ["rel branch major bump", "1.2.0"     , "dev"  , undefined    , "release/1.2.0", true    , undefined         ],
        ["rel branch cur dev"   , "1.1.0-dev8", "dev"  , "1.2.0-dev1" , "release/1.2.0", false   , undefined         ],
        ["incorrect prerelease" , "1.1.0-devs", "dev"  , undefined    , "master"       , false   , "1.2.0-dev1"      ],
        ["wrong bump input"     , "1.1.0-dev1", "beep" , undefined    , "master"       , false   , undefined         ],
        ["unauth'd branch dev"  , "1.1.0-dev1", "dev"  , undefined    , "mister"       , false   , "1.1.0-dev2"      ], // <-- TODO: make fail; not
        ["unauth'd branch rc"   , "1.1.0-dev1", "rc"   , undefined    , "mister"       , false   , "1.1.0-rc1"       ], // <--       implemented yet
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

//const devBumpTests =
//  /* test desc   */ [
//    "no draft",
//    "next version",
//    "current version",
//    "previous version",
//  ],
//  /* init version*/ "1.2.0",
//  /* bump type   */ "dev",
//  /* draft rel   */ [undefined, "1.3.0-dev19", "1.2.0-dev4", "1.1.0-dev10"],
//  /* branch      */ "master",
//  /* breaking?   */ false,
//  /* expected    */ ["1.3.0-dev1", "1.3.0-dev20", "1.3.0-dev1", "1.3.0-dev1"]
//);

afterAll(() => {
  jest.restoreAllMocks();
});
