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
const fs = require("fs");
const github = require("@actions/github");

const github_token = core.getInput("token");
const octokit = github.getOctokit(github_token);

export const IS_PULLREQUEST_EVENT = github.context.eventName === "pull_request";
export const PULLREQUEST_ID = github.context.issue.number;

/**
 * Retrieves a list of commits associated with the specified Pull Request
 * @param owner GitHub owner
 * @param repo GitHub repository
 * @param pullrequest_id GitHub Pullrequest ID
 * @returns List of commit objects
 */
export async function getCommits(
  owner: string,
  repo: string,
  pullrequest_id: string
) {
  // Retrieve commits from provided Pull Request
  const { data: commits } = await octokit.rest.pulls.listCommits({
    owner: owner,
    repo: repo,
    pull_number: pullrequest_id,
  });

  return commits;
}

/**
 * Retrieves the Pull Request associated with the specified Pull Request ID
 * @param owner GitHub owner
 * @param repo GitHub repository
 * @param pullrequest_id GitHub Pullrequest ID
 * @returns Pull Request
 */
export async function getPullRequest(
  owner: string,
  repo: string,
  pullrequest_id: string
) {
  const { data: pr } = await octokit.rest.pulls.get({
    owner: owner,
    repo: repo,
    pull_number: pullrequest_id,
  });

  return pr;
}

/**
 * Creates a GitHub release named `tag_name` on the main branch of the provided repo
 * @param owner GitHub owner
 * @param repo GitHub repository
 * @param tag_name Name of the tag (and release)
 */
export async function createRelease(
  owner: string,
  repo: string,
  tag_name: string
) {
  await octokit.rest.repos.createRelease({
    owner: owner,
    repo: repo,
    tag_name: tag_name,
    name: tag_name,
    body: "",
    draft: false,
    prerelease: false,
  });
}

/**
 * Downloads the requested configuration file in case it exists.
 * @param owner GitHub owner
 * @param repo GitHub repository
 * @param path Path towards the Commisery configuration file
 */
export async function getConfig(owner: string, repo: string, path: string) {
  try {
    const { data: config_file } = await octokit.rest.repos.getContent({
      owner: owner,
      repo: repo,
      path: path,
    });

    console.log(config_file);

    fs.writeFileSync(
      ".commisery.yml",
      Buffer.from(config_file.content, "base64")
    );

    console.log(fs.readFileSync(".commisery.yml"));
  } catch (error) {
    console.log(error);
    return;
  }
}
