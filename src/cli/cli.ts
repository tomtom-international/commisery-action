#!/usr/bin/env node

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
const fs = require("fs");
const os = require("os");
const { Command } = require("commander");

import { ConventionalCommitMessage } from "../commit";
import { Configuration } from "../config";
import { ConventionalCommitError } from "../errors";

const program = new Command();
const gray = "\x1b[90m",
  red = "\x1b[91m",
  green = "\x1b[92m",
  yellow = "\x1b[93m",
  reset = "\x1b[0m";

program
  .name("commisery")
  .description("Commisery Conventional Commit Message Manager")
  .option("-c, --config <string>");

program
  .command("check")
  .description("Check Conventional Commit Compliance")
  .argument("<filehandle>", "Conventional Commit Message")
  .action((filehandle: string) => {
    const config = new Configuration(program.opts().config);
    const message = fs.readFileSync(filehandle, "utf8");

    try {
      new ConventionalCommitMessage(message, undefined, config);
    } catch (error) {
      if (error instanceof ConventionalCommitError) {
        for (const err of error.errors) {
          console.log(err.report());
        }
      }
    }
  });

program
  .command("overview")
  .description(
    "Lists the accepted Conventional Commit types and Rules (including description)"
  )
  .action(() => {
    const config = new Configuration(program.opts().config);

    console.log(
      dedent(`
    Conventional Commit types
    -------------------------`)
    );

    for (const key in config.tags) {
      const bumps =
        config.tags[key].bump && key !== "fix"
          ? ` ${yellow}(bumps patch)${reset}`
          : "";
      console.log(
        `${key}: ${gray}${config.tags[key].description}${reset}${bumps}`
      );
    }

    console.log(os.EOL);

    console.log(
      dedent(`
    Commisery Validation rules
    --------------------------
    [${green}o${reset}]: ${gray}rule is enabled${reset}, [${red}x${reset}]: ${gray}rule has been disabled${reset}
    `)
    );

    console.log(os.EOL);

    for (const rule in config.rules) {
      const status = config.rules[rule].enabled
        ? `${green}o${reset}`
        : `${red}x${reset}`;
      console.log(
        `[${status}] ${rule}: ${gray}${config.rules[rule].description}${reset}`
      );
    }
  });

program.parse();
