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

import { prepareEnvironment } from "./environment";
import { isCommitValid, getCommits } from "./commisery";

async function run() {
  // Ensure that commisery is installed
  try {
    await prepareEnvironment();

    let [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");

    // Validate each commit against Conventional Commit standard
    let commits = await getCommits(owner, repo, core.getInput("pull_request"));
    let success = true;

    for (const commit of commits) {
      core.startGroup(`🔍 Checking validity of ${commit.commit.message}`);
      let [valid, errors] = await isCommitValid(commit);

      if (!valid) {
        core.startGroup(`❌ Commit message contains error(s)"`);
        for (var error of errors) {
          const error_re = /\.commit-message:\d+:\d+:\s(error|info):\s(.*)/;
          const match = error_re.exec(error);
          if (!match) {
            continue;
          }

          if (match[1] === "error") {
            core.error(match[2], {
              title: `(${commit.sha}) ${commit.commit.message}`,
            });
          } else {
            core.info(match[2]);
          }
        }
        success = false;

        core.endGroup();
      } else {
        core.info(`✅ Commit message is compliant!`);
      }
    }
    core.endGroup();

    if (!success) {
      core.setFailed(
        `Commits in your Pull Request are not compliant to Conventional Commits`
      );

      // Post summary
      core.summary.write();
    } else {
      console.log(
        "✅ Your commit messages comply to the conventional commit standard!"
      );
    }
  } catch (ex) {
    core.setFailed((ex as Error).message);
  }
}

run();
