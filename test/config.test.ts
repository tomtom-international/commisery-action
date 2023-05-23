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

function withConfig(contents: string, func) {
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
      "C022",
      "C023",
      "C024",
    ];
    withConfig("", config => {
      const enabledRules = Object.entries(config.rules)
        .filter(item => (item[1] as Object)["enabled"])
        .map(item => item[0]);
      expect(enabledRules).toEqual(expectedRules);
    });
  });

  test("Default disabled ruleset", () => {
    const expectedRules = ["C026"];
    withConfig("", config => {
      const disabledRules = Object.entries(config.rules)
        .filter(item => !(item[1] as Object)["enabled"])
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
      config => {
        expect(config.rules["C003"].enabled).toEqual(false);
        expect(config.rules["C016"].enabled).toEqual(false);

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
      config => {
        expect(() => {
          new ConventionalCommitMessage("ci: make things", undefined, config);
        }).not.toThrow(ConventionalCommitError);
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
      config => {
        expect(config.rules["C026"].enabled).toEqual(true);

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
      config => {
        expect(coreWarning).toHaveBeenCalledTimes(1);
      }
    );
    coreWarning.mockRestore();
  });

  test("Default maximum subject length", () => {
    withConfig("", config => {
      expect(config.maxSubjectLength).toEqual(80);
    });
  });

  test("Override maximum subject length", () => {
    withConfig("max-subject-length: 100", config => {
      expect(config.maxSubjectLength).toEqual(100);
    });
  });

  test("Default tags", () => {
    withConfig("", config => {
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
      config => {
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
      config => {
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
      config => {
        const msg = new ConventionalCommitMessage(
          "typeA: do something requiring a custom type",
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
      config => {
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
      config => {
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
      config => {
        expect(config.tags["perf"].description).toEqual(
          _testData.DEFAULT_ACCEPTED_TAGS["perf"].description
        );
      }
    );
  });

  test("Default initial development value", () => {
    withConfig("", config => {
      expect(config.initialDevelopment).toEqual(true);
    });
  });

  test("Disable initial development", () => {
    withConfig("initial-development: false", config => {
      expect(config.initialDevelopment).toEqual(false);
    });
  });

  test("Default allowed branches", () => {
    withConfig("", config => {
      expect(config.allowedBranches).toEqual(".*");
    });
  });

  test("Customize allowed branches", () => {
    withConfig("allowed-branches: main", config => {
      expect(config.allowedBranches).toEqual("main");
    });
  });

  test("Default SdkVer create release branches", () => {
    withConfig("", config => {
      expect(config.sdkverCreateReleaseBranches).toBe(undefined);
    });
  });

  test("Boolean defaults", () => {
    withConfig(
      "version-scheme: sdkver\nsdkver-create-release-branches: true",
      config => {
        expect(config.sdkverCreateReleaseBranches).toBe("release/");
      }
    );
    withConfig(
      "version-scheme: sdkver\nsdkver-create-release-branches: false",
      config => {
        expect(config.sdkverCreateReleaseBranches).toBe(undefined);
      }
    );
  });

  test("String values", () => {
    withConfig(
      "version-scheme: sdkver\nsdkver-create-release-branches: some-release-prefix-",
      config => {
        expect(config.sdkverCreateReleaseBranches).toBe("some-release-prefix-");
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
      config => {
        expect(config.sdkverCreateReleaseBranches).toBe("release/");
      }
    );
    expect(core.warning).toHaveBeenCalledTimes(1);
  });
});
