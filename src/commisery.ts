/**
 * Copyright (C) 2020-2022, TomTom (http://tomtom.com).
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

const exec = require("@actions/exec");
const fs = require("fs");

import { COMMISERY_BIN } from "./environment";

/**
 * Strips ANSI color codes from the provided message
 * @param message
 * @returns message without ANSI color codes
 */
function stripANSIColor(message: string) {
  const pattern = [
    "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
    "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))",
  ].join("|");

  return message.replace(new RegExp(pattern, "g"), "");
}

/**
 * Converts error message into GitHub accepted format
 * @param message
 * @returns multiline message
 */
function getErrorSubjects(message: string) {
  let errors: string[] = [];

  for (var line of stripANSIColor(message).split("\n")) {
    if (line.startsWith(".commit-message") && line.indexOf(": error:") > -1) {
      errors.push(line);
    } else if (line.length > 0) {
      errors[errors.length - 1] += `\n${line}`;
    }
  }

  return errors;
}

/**
 * Validates the commit object against the Conventional Commit convention
 * @param commit
 * @returns
 */
export async function isCommitValid(message): Promise<[boolean, string[]]> {
  // Provide the commit message as file
  await fs.writeFileSync(".commit-message", message);
  const { exitCode: exitCode, stderr: stderr } = await exec.getExecOutput(
    COMMISERY_BIN,
    ["check", ".commit-message"],
    { ignoreReturnCode: true }
  );

  return [exitCode == 0, getErrorSubjects(stderr)];
}

/**
 * Returns a bumped version based on Conventional Commits after the latest Git tag
 * @returns
 */
export async function getBumpedVersion(): Promise<[string, string[]]> {
  const { stdout: version, stderr: stderr } = await exec.getExecOutput(
    COMMISERY_BIN,
    ["next-version"],
    { ignoreReturnCode: true }
  );
  return [version.trim(), stderr.split("\n")];
}
