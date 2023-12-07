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
import * as core from "@actions/core";
import * as fs from "fs";
import * as os from "os";

import * as Color from "./colors";

import { ConventionalCommitMessage } from "../commit";
import { Configuration } from "../config";
import { ConventionalCommitError } from "../errors";
import { Command } from "commander";
import { getCommitMessages, prettyPrintCommitMessage } from "./utils";

const program = new Command();

program
  .name("commisery")
  .description("Commisery Conventional Commit Message Manager")
  .option("-c, --config <string>");

program
  .command("check")
  .description(
    "Checks whether commit messages adhere to the Conventional Commits standard."
  )
  .option("-v, --verbose", "also print commit message metadata.", false)
  .argument(
    "[TARGET...]",
    `The \`TARGET\` can be:
  - a single commit hash
  - a file containing the commit message to check
  - a revision range that \`git rev-list\` can interpret
 When TARGET is omitted, 'HEAD' is implied.`
  )
  .action(async (target: string[], options) => {
    const config = new Configuration(program.opts().config);

    if (target.length === 0) {
      target = ["HEAD"];
    }

    let messages: { sha: string; body: string }[] = [];
    if (fs.existsSync(target.join(" "))) {
      messages = [
        {
          sha: target.join(" "),
          body: fs.readFileSync(target.join(" "), "utf8"),
        },
      ];
    } else {
      messages = await getCommitMessages(target);
    }

    for (const message of messages) {
      try {
        const commitmessage = new ConventionalCommitMessage(
          message.body,
          message.sha,
          config
        );

        if (options.verbose) {
          prettyPrintCommitMessage(commitmessage);
        }
      } catch (error: unknown) {
        if (error instanceof ConventionalCommitError) {
          for (const err of error.errors) {
            core.info(err.report());
          }
          continue;
        }

        throw error;
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
          ? ` ${Color.YELLOW("(bumps patch)")}`
          : "";
      core.info(
        `${key}: ${Color.GRAY(config.tags[key].description ?? "")}${bumps}`
      );
    }

    core.info(os.EOL);

    core.info(
      dedent(`
    Commisery Validation rules
    --------------------------
    [${Color.GREEN("o")}]: ${Color.GRAY("rule is enabled")}, [${Color.RED(
      "x"
    )}]: ${Color.GRAY("rule is disabled")}
    `)
    );

    core.info(os.EOL);

    config.rules.forEach((rule, key) => {
      const status: string = rule.enabled
        ? `${Color.GREEN("o")}`
        : `${Color.RED("x")}`;
      core.info(`[${status}] ${key}: ${Color.GRAY(rule.description ?? "")}`);
    });
  });

program.parse();
