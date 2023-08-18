#!/usr/bin/env node

/*
 * SPDX-FileCopyrightText: 2022 TomTom <http://tomtom.com>
 * SPDX-License-Identifier: Apache-2.0
 */

import dedent from "dedent";
import * as core from "@actions/core";
import * as fs from "fs";
import * as os from "os";

import { ConventionalCommitMessage } from "../commit";
import { Configuration } from "../config";
import { ConventionalCommitError } from "../errors";
import { Command } from "commander";
import { getCommitMessages } from "./utils";

const program = new Command();
const gray = "\x1b[90m";
const red = "\x1b[91m";
const green = "\x1b[92m";
const yellow = "\x1b[93m";
const reset = "\x1b[0m";

program
  .name("commisery")
  .description("Commisery Conventional Commit Message Manager")
  .option("-c, --config <string>");

program
  .command("check")
  .description(
    "Checks whether commit messages adhere to the Conventional Commits standard."
  )
  .argument(
    "[TARGET...]",
    `The \`TARGET\` can be:
  - a single commit hash
  - a file containing the commit message to check
  - a revision range that \`git rev-list\` can interpret
 When TARGET is omitted, 'HEAD' is implied.`
  )
  .action(async (target: string[]) => {
    const config = new Configuration(program.opts().config);

    if (target.length === 0) {
      target = ["HEAD"];
    }

    let messages: string[] = [];
    if (fs.existsSync(target.join(" "))) {
      messages = [fs.readFileSync(target.join(" "), "utf8")];
    } else {
      messages = await getCommitMessages(target);
    }

    for (const message of messages) {
      try {
        new ConventionalCommitMessage(message, undefined, config);
      } catch (error) {
        if (error instanceof ConventionalCommitError) {
          for (const err of error.errors) {
            core.info(err.report());
          }
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

    core.info(
      dedent(`
    Conventional Commit types
    -------------------------`)
    );

    for (const key in config.tags) {
      const bumps: string =
        config.tags[key].bump && key !== "fix"
          ? ` ${yellow}(bumps patch)${reset}`
          : "";
      core.info(
        `${key}: ${gray}${config.tags[key].description}${reset}${bumps}`
      );
    }

    core.info(os.EOL);

    core.info(
      dedent(`
    Commisery Validation rules
    --------------------------
    [${green}o${reset}]: ${gray}rule is enabled${reset}, [${red}x${reset}]: ${gray}rule is disabled${reset}
    `)
    );

    core.info(os.EOL);

    for (const rule in config.rules) {
      const status: string = config.rules[rule].enabled
        ? `${green}o${reset}`
        : `${red}x${reset}`;
      core.info(
        `[${status}] ${rule}: ${gray}${config.rules[rule].description}${reset}`
      );
    }
  });

program.parse();
