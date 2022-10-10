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
import { Configuration, _testData } from "../src/config";
import { SemVerType } from "../src/semver";
import { ConventionalCommitError } from "../src/errors";

const fs = require("fs");
jest.mock("fs");

afterEach(() => {
  jest.restoreAllMocks();
});

function withConfig(contents: string, func) {
  const exists = jest.spyOn(fs, "existsSync").mockImplementation(() => true);
  const read = jest
    .spyOn(fs, "readFileSync")
    .mockImplementation(() => contents);
  func();
  exists.mockRestore();
  read.mockRestore();
}

// Validation of the Configuration parameters
//
describe("Configurable options", () => {
  test("Disable specific rule", () => {
    withConfig(
      dedent(`
        max-subject-length: 100
        disable:
          - C003
          - C016
        `),
      () => {
        expect(() => {
          new ConventionalCommitMessage("fix: updated testing");
        }).not.toThrow(ConventionalCommitError);
      }
    );
  });

  test("Override maximum subject length", () => {
    withConfig(
      dedent(`
        max-subject-length: 100
        disable:
          - C003
          - C016
        `),
      () => {
        expect(() => {
          new ConventionalCommitMessage(`fix: add ${"0".repeat(91)}`);
        }).not.toThrow(ConventionalCommitError);
        expect(() => {
          new ConventionalCommitMessage(`fix: add ${"0".repeat(92)}`);
        }).toThrow(ConventionalCommitError);
      }
    );
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
      () => {
        const msg = new ConventionalCommitMessage(
          "typeA: do something requiring a custom type"
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
      () => {
        expect(() => {
          new ConventionalCommitMessage(
            "typeA: do something requiring a custom type"
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
      () => {
        const msg = new ConventionalCommitMessage(
          "typeA: do something requiring a custom type"
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
      () => {
        // Types are overwritten, so expect "chore" not to be acceptable
        expect(() => {
          const msg2 = new ConventionalCommitMessage(
            "chore: add something chore-ish"
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
      () => {
        const acceptedTypes = Object.keys(new Configuration().tags);

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
      () => {
        expect(new Configuration().tags["perf"].description).toEqual(
          _testData.DEFAULT_ACCEPTED_TAGS["perf"].description
        );
      }
    );
  });
});
