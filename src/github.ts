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

const [OWNER, REPO] = (process.env.GITHUB_REPOSITORY || "").split("/");

/**
 * Retrieves a list of commits associated with the specified Pull Request
 * @param pullrequest_id GitHub Pullrequest ID
 * @returns List of commit objects
 */
export async function getCommits(pullrequest_id: string) {
  // Retrieve commits from provided Pull Request
  const { data: commits } = await octokit.rest.pulls.listCommits({
    owner: OWNER,
    repo: REPO,
    pull_number: pullrequest_id,
  });

  return commits;
}

/**
 * Retrieves the Pull Request associated with the specified Pull Request ID
 * @param pullrequest_id GitHub Pullrequest ID
 * @returns Pull Request
 */
export async function getPullRequest(pullrequest_id: string) {
  const { data: pr } = await octokit.rest.pulls.get({
    owner: OWNER,
    repo: REPO,
    pull_number: pullrequest_id,
  });

  return pr;
}

/**
 * Creates a GitHub release named `tag_name` on the main branch of the provided repo

 * @param tag_name Name of the tag (and release)
 */
export async function createRelease(tag_name: string) {
  await octokit.rest.repos.createRelease({
    owner: OWNER,
    repo: REPO,
    tag_name: tag_name,
    name: tag_name,
    body: "",
    draft: false,
    prerelease: false,
  });
}

/**
 * Downloads the requested configuration file in case it exists.
 * @param path Path towards the Commisery configuration file
 */
export async function getConfig(path: string) {
  try {
    const { data: config_file } = await octokit.rest.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path: path,
      ref: github.context.ref,
    });

    fs.writeFileSync(
      ".commisery.yml",
      Buffer.from(config_file.content, "base64")
    );
  } catch (error) {
    core.debug(error);
    return;
  }
}

/**
 * Retrieve the latest tag from GitHub
 */
export async function getLatestTag() {
  const tags = await octokit.paginate(octokit.rest.repos.listTags, {
    owner: OWNER,
    repo: REPO,
  });

  return tags[0].name;
}

/**
 * Retrieve all commits since specified tag
 */
export async function getCommitsSinceTag(tag: string) {
  const commits = await octokit.paginate(octokit.rest.repos.listCommits, {
    owner: OWNER,
    repo: REPO,
    sha: `refs/tags/${tag}`,
  });

  return commits;
}
