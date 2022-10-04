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

const fs = require("fs");
const yaml = require("yaml");

const DEFAULT_CONFIGURATION_FILE = ".commisery.yml";
const DEFAULT_ACCEPTED_TAGS = {
  fix: "Patches a bug in your codebase",
  feat: "Introduces a new feature to the codebase",
  build: "Changes towards the build system",
  chore: "General maintenance changes to the codebase",
  ci: "Changes related to your CI configuration",
  docs: "Documentation changes (not part of the public API)",
  perf: "Performance improvements",
  refactor: "Refactoring the code base (no behaviorial changes)",
  revert: "Reverts previous change(s) from your codebase",
  style: "Coding style improvements",
  test: "Updates tests",
  improvement: "Introduces improvements to the code quality of the codebase",
};
const DEFAULT_IGNORED_RULES = [];

const CONFIG_ITEMS = [
  "max-subject-length",
  "tags",
  "disable",
  "allowed-branches",
];

/**
 * Configuration (from file)
 */
export class Configuration {
  max_subject_length: number = 80;
  allowed_branches: string = ".*";
  tags: {} = DEFAULT_ACCEPTED_TAGS;
  ignore: string[] = DEFAULT_IGNORED_RULES;
  rules: {} = {};

  private loadFromData(data: any) {
    for (const key in data) {
      if (CONFIG_ITEMS.indexOf(key) === -1) {
        throw new Error(`Unknown configuration item '${key} detected!`);
      }

      switch (key) {
        case "disable":
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
          if (typeof data[key] == "object") {
            for (const tag in data[key]) {
              if (typeof data[key][tag] !== "string") {
                throw new Error(
                  `Incorrect type '${typeof data[key][
                    tag
                  ]}' for '${key}.${tag}', must be 'string'`
                );
              }
            }

            this.tags = data[key];

            if (!("feat" in this.tags)) {
              this.tags["feat"] = DEFAULT_ACCEPTED_TAGS["feat"];
            }
            if (!("fix" in this.tags)) {
              this.tags["fix"] = DEFAULT_ACCEPTED_TAGS["fix"];
            }
          } else {
            throw new Error(
              `Incorrect type '${typeof data[
                key
              ]}' for '${key}', must be '${typeof this.tags}'!`
            );
          }
          break;

        case "allowed-branches":
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
