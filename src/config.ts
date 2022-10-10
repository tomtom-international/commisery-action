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

import { ALL_RULES } from "./rules";
import { ITypeTagConfigItem, IRuleConfigItem } from "./interfaces";

const fs = require("fs");
const yaml = require("yaml");

const DEFAULT_CONFIGURATION_FILE = ".commisery.yml";
const DEFAULT_ACCEPTED_TAGS: Record<string, ITypeTagConfigItem> = {
  fix: {
    description: "Patches a bug in your codebase",
    bump: true,
  },
  feat: {
    description: "Introduces a new feature to the codebase",
    bump: false,
  },
  build: { description: "Changes towards the build system", bump: false },
  chore: {
    description: "General maintenance changes to the codebase",
    bump: false,
  },
  ci: { description: "Changes related to your CI configuration", bump: false },
  docs: {
    description: "Documentation changes (not part of the public API)",
    bump: false,
  },
  perf: { description: "Performance improvements", bump: false },
  refactor: {
    description: "Refactoring the code base (no behaviorial changes)",
    bump: false,
  },
  revert: {
    description: "Reverts previous change(s) from your codebase",
    bump: false,
  },
  style: { description: "Coding style improvements", bump: false },
  test: { description: "Updates tests", bump: false },
  improvement: {
    description: "Introduces improvements to the code quality of the codebase",
    bump: false,
  },
};

const DEFAULT_IGNORED_RULES = [];

const CONFIG_ITEMS = [
  "max-subject-length",
  "tags",
  "disable",
  "allowed-branches",
];

/**
 * This function takes two values and throws when their types don't match.
 */
function verifyTypeMatches(
  name: string,
  typeToTest: any,
  typeItShouldBe: any
): void {
  if (typeof typeToTest !== typeof typeItShouldBe) {
    throw new Error(
      `Incorrect type '${typeof typeToTest}' for '${name}', must be '${typeof typeItShouldBe}'`
    );
  }
}

/**
 * Configuration (from file)
 */
export class Configuration {
  max_subject_length: number = 80;
  allowed_branches: string = ".*";
  tags: Record<string, ITypeTagConfigItem> = DEFAULT_ACCEPTED_TAGS;
  rules: Map<string, IRuleConfigItem> = new Map<string, IRuleConfigItem>();

  private loadFromData(data: any) {
    for (const key in data) {
      if (CONFIG_ITEMS.indexOf(key) === -1) {
        throw new Error(`Unknown configuration item '${key} detected!`);
      }

      switch (key) {
        case "disable":
          /* Example YAML:
           *   disable:
           *     - C001
           *     - C018
           */
          if (typeof data[key] === "object") {
            for (const item of data[key]) {
              this.rules[item].enabled = false;
            }
          } else {
            throw new Error(
              `Incorrect type '${typeof data[
                key
              ]} for ${key}, must be '${typeof []}`
            );
          }
          break;

        case "max-subject-length":
          /* Example YAML:
           *   max-subject-length: 80
           */
          if (typeof data[key] === "number") {
            this.max_subject_length = data[key];
          } else {
            throw new Error(
              `Incorrect type '${typeof data[
                key
              ]}' for '${key}', must be '${typeof this.max_subject_length}'!`
            );
          }
          break;

        case "tags":
          /* Example YAML:
           *   tags:
           *     perf:
           *       description: Non-functional performance improvement
           *       bump: true
           *     improvement: General non-functional improvements
           *     revert:
           *       bump: true
           */
          verifyTypeMatches(key, data[key], {});
          this.tags = {};
          for (const typ of Object.keys(data[key])) {
            const typeValue = data[key][typ];
            switch (typeof typeValue) {
              case "string":
                this.tags[typ] = { description: typeValue, bump: false };
                break;

              case "object":
                for (const entry of Object.keys(typeValue)) {
                  if (["description", "bump"].includes(entry)) {
                    if (entry === "description") {
                      verifyTypeMatches(
                        `${typ}.${entry}`,
                        typeValue[entry],
                        ""
                      );
                    } else if (entry === "bump") {
                      verifyTypeMatches(
                        `${typ}.${entry}`,
                        typeValue[entry],
                        true
                      );
                    }
                    this.tags[typ] = this.tags[typ] ? this.tags[typ] : {};
                    this.tags[typ][entry] = typeValue[entry];
                  } else {
                    console.log(
                      `Warning: "${key}.${typ}.${entry}" is unknown and has no effect.`
                    );
                  }
                }
                break;
              default:
                break;
            }
          }
          if (!("fix" in this.tags)) {
            this.tags["fix"] = DEFAULT_ACCEPTED_TAGS["fix"];
          }
          if (!("feat" in this.tags)) {
            this.tags["feat"] = DEFAULT_ACCEPTED_TAGS["feat"];
          }

          // Make sure both description and bump values are set for all entries in `tags`
          for (const typ in this.tags) {
            if (this.tags[typ].description === undefined) {
              let desc = "";
              // Use the default description if it's one of the default tags
              if (typ in DEFAULT_ACCEPTED_TAGS) {
                desc = DEFAULT_ACCEPTED_TAGS[typ].description!;
              }
              this.tags[typ].description = desc;
            }
            this.tags[typ].bump ??= false;
          }
          break;

        case "allowed-branches":
          /* Example YAML:
           *   allowed-branches: "^ma(in|ster)$"
           */
          if (typeof data[key] === "string") {
            this.allowed_branches = data[key];
          } else {
            throw new Error(
              `Incorrect type '${typeof data[
                key
              ]}' for '${key}', must be '${typeof this.allowed_branches}'!`
            );
          }
          break;
      }
    }
  }

  /**
   * Constructs a Configuration parameters from file
   */
  constructor(config_path: string = DEFAULT_CONFIGURATION_FILE) {
    // Enable all rules by default
    for (const rule of ALL_RULES) {
      this.rules[rule.id] = {
        description: rule.description,
        enabled: true,
      };
    }
    if (fs.existsSync(config_path)) {
      const data = yaml.parse(fs.readFileSync(config_path, "utf8"));
      this.loadFromData(data);
    } else {
      if (config_path !== DEFAULT_CONFIGURATION_FILE) {
        throw new Error(`No configuration can be found at: ${config_path}`);
      }
    }
  }
}

/* Exports for tests only */
export const _testData = {
  DEFAULT_ACCEPTED_TAGS,
};
