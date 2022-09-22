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

/**
 * Returns a bumped version based on Conventional Commits after the latest Git tag
 * @returns
 */
export async function getBumpedVersion(): Promise<[string, string[]]> {
  const { stdout: version, stderr: stderr } = await exec.getExecOutput(
    "cm",
    ["next-version"],
    { ignoreReturnCode: true }
  );
  return [version.trim(), stderr.split("\n")];
}
