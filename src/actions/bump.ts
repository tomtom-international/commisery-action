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

const core = require("@actions/core");
const exec = require("@actions/exec");

import { getBumpedVersion } from "../commisery";
import { createRelease, getLatestTag } from "../github";

async function getCurrentSemanticVersion(): Promise<string> {
  const version = await getLatestTag();
  const SEMVER_REGEX = new RegExp(
    /(?<major>0|[1-9][0-9]*)\./.source +
      /(?<minor>0|[1-9][0-9]*)\./.source +
      /(?<patch>0|[1-9][0-9]*)/.source +
      /(?:-(?<prerelease>[-0-9a-zA-Z]+(?:\.[-0-9a-zA-Z]+)*))?/.source +
      /(?:\+(?<build>[-0-9a-zA-Z]+(?:\.[-0-9a-zA-Z]+)*))?\s*$/.source
  );

  if (version) {
    const match = version.match(SEMVER_REGEX);
    if (match) {
      const m = match.groups;
      const prerelease = m.prerelease ? `-${m.prerelease}` : "";
      return `${m.major}.${m.minor}.${m.patch}${prerelease}`;
    }
  }
  return "";
}

async function run() {
  try {
    //await prepareEnvironment();
    const prefix = core.getInput("version-prefix");

    core.startGroup("🔍 Determining version bump...");
    const current_version = await getCurrentSemanticVersion();
    core.setOutput("current-version", current_version);
    const [version, logs] = await getBumpedVersion();
    core.endGroup();

    console.log(`ℹ️ Current version: ${current_version}`);

    if (version) {
      const next_version = `${prefix}${version}`;
      let message = "new version is: ";

      if (core.getInput("create-release") === "true") {
        createRelease(next_version);
        message = "created GitHub Release: ";
      }

      console.log(`✅ Version bumped: ${message}${next_version}`);
      core.setOutput("next-version", next_version);
    } else {
      for (const line of logs) {
        const log_re = /^([A-Z]+):.+:(.*)$/;
        const match = log_re.exec(line);
        if (match) {
          if (match[1] === "ERROR") {
            core.error(match[2]);
          } else if (match[1] === "WARNING") {
            core.warning(match[2]);
          } else {
            core.info(match[2]);
          }
        } else {
          core.info(line);
        }
      }
    }
  } catch (ex) {
    core.startGroup("❌ Exception");
    core.setFailed((ex as Error).message);
  }
}

run();
