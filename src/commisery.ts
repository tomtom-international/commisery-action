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
const github = require("@actions/github");
const fs = require("fs");

/**
 * Strips ANSI color codes from the provided message
 * @param message
 * @returns message without ANSI color codes
 */
function strip_ansicolor(message: string) {
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
function get_error_subjects(message: string) {
  let errors: string[] = [];

  for (var line of strip_ansicolor(message).split("\n")) {
    if (line.startsWith(".commit-message") && line.indexOf(": error:") > -1) {
      errors.push(line);
    } else if (line.length > 0) {
      errors[errors.length - 1] += `\n${line}`;
    }
  }

  return errors;
}

/**
 * Retrieves a list of commits associated with the specified Pull Request
 * @param owner GitHub owner
 * @param repo GitHub repository
 * @param pullrequest_id GitHub Pullrequest ID
 * @returns List of commit objects
 */
export async function get_commits(
  owner: string,
  repo: string,
  pullrequest_id: string
) {
  const github_token = core.getInput("token");
  const octokit = github.getOctokit(github_token);

  // Retrieve commits from provided Pull Request
  const { data: commits } = await octokit.rest.pulls.listCommits({
    owner: owner,
    repo: repo,
    pull_number: pullrequest_id,
  });

  return commits;
}

/**
 * Validates the commit object against the Conventional Commit convention
 * @param commit
 * @returns
 */
export async function is_commit_valid(commit): Promise<[boolean, string[]]> {
  // Provide the commit message as file
  await fs.writeFileSync(".commit-message", commit.commit.message);

  let stderr = "";

  try {
    await exec.exec("commisery-verify-msg", [".commit-message"], {
      ignoreReturnCode: true,
      silent: true,
      listeners: {
        stderr: (data: Buffer): string => (stderr += data.toString()),
      },
    });
  } catch (error) {
    core.debug("Error detected while executing commisery");
  }

  return [stderr == "", get_error_subjects(stderr)];
}
