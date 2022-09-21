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

const core = require("@actions/core");
const exec = require("@actions/exec");

import * as path from "path";

import { getConfig } from "./github";

/**
 * Checks whether the provided Python version is present
 *
 * @param major Major version
 * @param minor Minor version
 */
async function checkPythonPrerequisites(major, minor) {
  const python_version_re = /Python\s*(\d+)\.(\d+)\.(\d+)/;
  const { stdout: python_version } = await exec.getExecOutput("python3", [
    "--version",
  ]);
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
    await exec.getExecOutput("python3", ["-m", "pip", "--version"]);
  } catch {
    throw new Error("Unable to determine the installed Pip version.");
  }
}

/**
 * Prepares the environment for using commisery
 */
export async function prepareEnvironment() {
  core.startGroup("🌲 Preparing environment...");

  // Ensure Python (>= 3.8) and pip are installed
  await checkPythonPrerequisites(3, 8);

  // Install latest version of commisery
  await exec.exec("python3", [
    "-m",
    "pip",
    "install",
    "--upgrade",
    "--requirement",
    path.join(__dirname, "requirements.txt"),
  ]);

  // Retrieve the configuration
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
  await getConfig(owner, repo, core.getInput("config"));

  core.endGroup();
}
