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

import * as path from "path";

/**
 * Checks whether the provided Python version is present
 *
 * @param major Major version
 * @param minor Minor version
 */
async function check_python_prerequisites(major, minor) {
  const python_version_re = /Python\s*(\d+)\.(\d+)\.(\d+)/;
  const { stdout: python_version } = await exec.getExecOutput(
    "python3",
    ["--version"],
    { silent: true }
  );
  const match = python_version_re.exec(python_version);

  if (!match || match.length != 4) {
    throw new Error("Unable to determine the installed Python version.");
  }

  if (!(parseInt(match[1]) == major && parseInt(match[2]) >= minor)) {
    throw new Error(
      `Incorrect Python version installed; found ${match[1]}.${match[2]}.${match[3]}, expected >= ${major}.${minor}.0`
    );
  }

  try {
    const { stdout: pip_version } = await exec.getExecOutput(
      "python3",
      ["-m", "pip", "--version"],
      { silent: true }
    );
  } catch {
    throw new Error("Unable to determine the installed Pip version.");
  }
}

/**
 * Prepares the environment for using commisery
 */
export async function prepare_environment() {
  // Ensure Python (>= 3.8) and pip are installed
  await check_python_prerequisites(3, 8);

  // Install latest version of commisery
  await exec.exec(
    "python3",
    [
      "-m",
      "pip",
      "install",
      "--upgrade",
      "--requirement",
      path.join(__dirname, "requirements.txt"),
    ],
    { silent: true }
  );
}
