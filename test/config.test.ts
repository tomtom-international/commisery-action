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
import * as core from "@actions/core";

import { ConventionalCommitMessage } from "../src/commit";
import { Configuration, _testData } from "../src/config";
import { SemVerType } from "../src/semver";
import { ConventionalCommitError } from "../src/errors";

const fs = require("fs");
jest.mock("fs", () => ({
  promises: {
    access: jest.fn(),
  },
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

afterEach(() => {
  jest.restoreAllMocks();
});

function withConfig(contents: string, func: any) {
  const exists = jest.spyOn(fs, "existsSync").mockImplementation(() => true);
  const read = jest
    .spyOn(fs, "readFileSync")
    .mockImplementation(() => contents);
  func(new Configuration());
  exists.mockRestore();
  read.mockRestore();
}

// Validation of the Configuration parameters
//
describe("Configurable options", () => {
  test("Default enabled ruleset", () => {
    const expectedRules = [
      "C001",
      "C002",
      "C003",
      "C004",
      "C005",
      "C006",
      "C007",
      "C008",
      "C009",
      "C010",
      "C011",
      "C012",
      "C013",
      "C014",
      "C015",
      "C016",
      "C017",
      "C018",
      "C019",
      "C020",
      "C023",
      "C024",
    ];
    withConfig("", (config: Configuration) => {
      const enabledRules = Array.from(config.rules)
        .filter(item => item[1].enabled)
        .map(item => item[0]);
      expect(enabledRules).toEqual(expectedRules);
    });
  });

  test("Default disabled ruleset", () => {
    const expectedRules = ["C026"];
    withConfig("", (config: Configuration) => {
      const disabledRules = Array.from(config.rules)
        .filter(item => !item[1].enabled)
        .map(item => item[0]);
      expect(disabledRules).toEqual(expectedRules);
    });
  });

  test("Disable specific rule", () => {
    withConfig(
      dedent(`
        max-subject-length: 100
        disable:
          - C003
          - C016
        `),
      (config: Configuration) => {
        expect(config.rules.get("C003")?.enabled).toEqual(false);
        expect(config.rules.get("C016")?.enabled).toEqual(false);

        expect(() => {
          new ConventionalCommitMessage(
            "fix: updated testing",
            undefined,
            config
          );
        }).not.toThrow(ConventionalCommitError);
      }
    );
  });

  test("Disable nonexistent rule", () => {
    const coreWarning = jest.spyOn(core, "warning").mockImplementation();
    withConfig(
      dedent(`
        disable:
          - C001
          - XYZZY0123
          - C002
        `),
      (_config: Configuration) => {
        expect(coreWarning).toHaveBeenCalledTimes(1);
      }
    );
    coreWarning.mockRestore();
  });

  test("Enable specific rule", () => {
    withConfig(
      dedent(`
        enable:
          - C026
        `),
      (config: Configuration) => {
        expect(config.rules.get("C026")?.enabled).toEqual(true);

        expect(() => {
          new ConventionalCommitMessage(
            dedent(`
            fix: updated testing`),
            undefined,
            config
          );
        }).toThrow(ConventionalCommitError);
      }
    );
  });

  test("Enable nonexistent rule", () => {
    const coreWarning = jest.spyOn(core, "warning").mockImplementation();
    withConfig(
      dedent(`
        enable:
          - C001
          - XYZZY0123
          - C002
        `),
      (_config: Configuration) => {
        expect(coreWarning).toHaveBeenCalledTimes(1);
      }
    );
    coreWarning.mockRestore();
  });

  test("Default maximum subject length", () => {
    withConfig("", (config: Configuration) => {
      expect(config.maxSubjectLength).toEqual(80);
    });
  });

  test("Override maximum subject length", () => {
    withConfig("max-subject-length: 100", (config: Configuration) => {
      expect(config.maxSubjectLength).toEqual(100);
    });
  });

  test("Default tags", () => {
    withConfig("", (config: Configuration) => {
      for (const [key, value] of Object.entries(
        _testData.DEFAULT_ACCEPTED_TAGS
      )) {
        expect(config.tags[key]).not.toBeUndefined();
        expect(config.tags[key].bump).toEqual(value.bump);
      }
    });
  });

  test("Additional patch bumping tag with uppercase letter", () => {
    withConfig(
      dedent(`
        tags:
          typeA:
            description: Some custom type
            bump: true
        disable:
          - C001
        `),
      (config: Configuration) => {
        const msg = new ConventionalCommitMessage(
          "typeA: do something requiring a custom type",
          undefined,
          config
        );
        expect(msg.bump).toBe(SemVerType.PATCH);
      }
    );
  });

  test("Additional patch bumping tag with uppercase letter without rule", () => {
    withConfig(
      dedent(`
        tags:
          typeA:
            description: Some custom type
            bump: true
        `),
      (config: Configuration) => {
        expect(() => {
          new ConventionalCommitMessage(
            "typeA: do something requiring a custom type",
            undefined,
            config
          );
        }).toThrow(ConventionalCommitError);
      }
    );
  });

  test("Additional non-bumping tag", () => {
    withConfig(
      dedent(`
        tags:
          typeA:
            bump: false
        disable:
          - C001
        `),
      (config: Configuration) => {
        const msg = new ConventionalCommitMessage(
          "typeA: do something requiring a custom type",
          undefined,
          config
        );
        expect(msg.bump).toBe(SemVerType.NONE);
      }
    );
  });

  test("Default overwritable bumping tag (revert)", () => {
    // With the default "tags" config, "revert" should bump
    withConfig(
      dedent(`
        disable:
          - C001
        `),
      (config: Configuration) => {
        const msg = new ConventionalCommitMessage(
          "revert: oopsie",
          undefined,
          config
        );
        expect(msg.bump).toBe(SemVerType.PATCH);
      }
    );
    // ...but with a non-default "tags" config, "revert" should _not_ bump unless
    // explicitly configured to do so
    withConfig(
      dedent(`
        tags:
          othertype: A description of "othertype" here
          revert: A description of "revert" here
        disable:
          - C001
        `),
      (config: Configuration) => {
        const msg = new ConventionalCommitMessage(
          "revert: oopsie",
          undefined,
          config
        );
        expect(msg.bump).toBe(SemVerType.NONE);
      }
    );
  });

  test("Type configuration overwriting defaults", () => {
    // With the default config, "chore" should be accepted
    expect(() => {
      const msg1 = new ConventionalCommitMessage(
        "chore: add something chore-ish"
      );
    }).not.toThrow(ConventionalCommitError);

    withConfig(
      dedent(`
        tags:
          typeA:
            bump: false
        disable:
          - C001
        `),
      (config: Configuration) => {
        // Types are overwritten, so expect "chore" not to be acceptable
        expect(() => {
          const msg2 = new ConventionalCommitMessage(
            "chore: add something chore-ish",
            undefined,
            config
          );
        }).toThrow(ConventionalCommitError);
      }
    );
  });

  test("Type configuration overwriting defaults", () => {
    withConfig(
      dedent(`
        tags:
          perf:
            bump: true
        `),
      (config: Configuration) => {
        const acceptedTypes = Object.keys(config.tags);

        expect(acceptedTypes).toHaveLength(3);
        expect(acceptedTypes).toEqual(
          expect.arrayContaining(["feat", "fix", "perf"])
        );
      }
    );
  });

  test("Get default descriptions for default types", () => {
    withConfig(
      dedent(`
        tags:
          perf:
            bump: true
          improvement:
            bump: true
        `),
      (config: Configuration) => {
        expect(config.tags["perf"].description).toEqual(
          _testData.DEFAULT_ACCEPTED_TAGS["perf"].description
        );
      }
    );
  });

  test("Default initial development value", () => {
    withConfig("", (config: Configuration) => {
      expect(config.initialDevelopment).toEqual(true);
    });
  });

  test("Disable initial development", () => {
    withConfig("initial-development: false", (config: Configuration) => {
      expect(config.initialDevelopment).toEqual(false);
    });
  });

  test("Default allowed branches", () => {
    withConfig("", (config: Configuration) => {
      expect(config.allowedBranches).toEqual(".*");
    });
  });

  test("Customize allowed branches", () => {
    withConfig("allowed-branches: main", (config: Configuration) => {
      expect(config.allowedBranches).toEqual("main");
    });
  });

  test("Default SdkVer create release branches", () => {
    withConfig("", (config: Configuration) => {
      expect(config.sdkverCreateReleaseBranches).toBe(undefined);
    });
  });

  test("Default version prefix", () => {
    withConfig("", (config: Configuration) => {
      expect(config.versionPrefix).toBe("*");
    });
  });

  test("Boolean defaults", () => {
    withConfig(
      "version-scheme: sdkver\nsdkver-create-release-branches: true",
      (config: Configuration) => {
        expect(config.sdkverCreateReleaseBranches).toBe("release/");
      }
    );
    withConfig(
      "version-scheme: sdkver\nsdkver-create-release-branches: false",
      (config: Configuration) => {
        expect(config.sdkverCreateReleaseBranches).toBe(undefined);
      }
    );
  });

  test("String values", () => {
    withConfig(
      "version-scheme: sdkver\nsdkver-create-release-branches: some-release-prefix-\nversion-prefix: X",
      (config: Configuration) => {
        expect(config.sdkverCreateReleaseBranches).toBe("some-release-prefix-");
        expect(config.versionPrefix).toBe("X");
      }
    );
  });

  test("Enable SdkVer create release branches on non-SdkVer", () => {
    // We expect a warning about this option not being useful when the version
    // scheme is not 'sdkver'
    jest.spyOn(core, "warning").mockImplementation(arg => {
      expect(arg).toContain("sdkver-create-release-branches");
      expect(arg).toContain("version-scheme");
    });
    withConfig(
      "version-scheme: semver\nsdkver-create-release-branches: true",
      (config: Configuration) => {
        expect(config.sdkverCreateReleaseBranches).toBe("release/");
      }
    );
    expect(core.warning).toHaveBeenCalledTimes(1);
  });
});

describe("(Deep) Copy of Configuration", () => {
  test("Default settings", () => {
    const config = new Configuration();
    const copy = config.copy();
    expect(config).toEqual(copy);
  });

  test("Modification of copy does not affect original", () => {
    const config = new Configuration();
    const copy = config.copy();

    copy.maxSubjectLength = 100;

    expect(config.maxSubjectLength).toEqual(80);
  });

  test("Modification of original does not affect copy", () => {
    const config = new Configuration();
    const copy = config.copy();

    config.maxSubjectLength = 100;

    expect(copy.maxSubjectLength).toEqual(80);
  });

  test("Modification of nested object in copy does not affect original", () => {
    const config = new Configuration();
    const copy = config.copy();

    copy.tags["ci"].bump = true;
    copy.setRuleActive("C001", false);

    expect(config.rules.get("C001")?.enabled).toEqual(true);
    expect(config.tags["ci"].bump).toEqual(false);
  });

  test("Modification of nested object in original does not affect copy", () => {
    const config = new Configuration();
    const copy = config.copy();

    config.tags["ci"].bump = true;
    config.setRuleActive("C001", false);

    expect(copy.rules.get("C001")?.enabled).toEqual(true);
    expect(copy.tags["ci"].bump).toEqual(false);
  });
});
