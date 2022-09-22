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

const fs = require("fs");
const os = require("os");
const { Command } = require("commander");

import { ConventionalCommitMessage } from "../commit";
import { Configuration } from "../config";
import { ConventionalCommitError } from "../rules";

const program = new Command();

program
  .name("commisery")
  .description("Commisery Conventional Commit Message Manager");

program
  .command("check")
  .description("Check Conventional Commit Compliance")
  .argument("<filehandle>", "Conventional Commit Message")
  .action((filehandle: string) => {
    const config = new Configuration();
    const message = fs.readFileSync(filehandle, "utf8");

    try {
      const commit = new ConventionalCommitMessage(message, undefined, config);
    } catch (error) {
      if (error instanceof ConventionalCommitError) {
        for (const err of error.errors) {
          console.log(err.report());
        }
      }
    }
  });

program.parse();
