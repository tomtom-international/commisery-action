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

import { readFileSync } from "fs";
import { EOL } from "os";
import * as core from "@actions/core";

import dedent from "dedent";
import { Command } from "commander";
import { ConventionalCommitMessage } from "../commit";
import { Configuration } from "../config";
import { ConventionalCommitError } from "../errors";

const program = new Command();

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
    const message = readFileSync(filehandle, "utf8");

    try {
      new ConventionalCommitMessage(message, undefined, config);
    } catch (error) {
      if (error instanceof ConventionalCommitError) {
        for (const err of error.errors) {
          core.info(err.report());
        }
      }
    }
  });

program
  .command("overview")
  .description(
    "Lists the accepted Conventional Commit tags and Rules (including description)"
  )
  .action(() => {
    const config = new Configuration(program.opts().config);

    core.info(
      dedent(`
    Conventional Commit tags
    ------------------------`)
    );

    for (const key in config.tags) {
      core.info(`${key}: \x1b[90m${config.tags[key]}\x1b[0m`);
    }

    core.info(EOL);

    core.info(
      dedent(`
    Commisery Validation rules
    --------------------------
    [\x1b[92mo\x1b[0m]: \x1b[90mrule is enabled\x1b[0m, [\x1b[91mx\x1b[0m]: \x1b[90mrule has been disabled\x1b[0m
    `)
    );

    core.info(EOL);

    for (const rule in config.rules) {
      const status = config.rules[rule].enabled
        ? `\x1b[92mo\x1b[0m`
        : `\x1b[91mx\x1b[0m`;
      core.info(
        `[${status}] ${rule}: \x1b[90m${config.rules[rule].description}\x1b[0m`
      );
    }
  });

program.parse();
