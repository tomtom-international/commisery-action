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

import * as core from "@actions/core";
import * as fs from "fs";
import * as github from "@actions/github";
import * as octokit from "@octokit/plugin-rest-endpoint-methods";
import { GitHub } from "@actions/github/lib/utils";
import { IGitTag } from "./interfaces";

const [OWNER, REPO] = (process.env.GITHUB_REPOSITORY || "").split("/");

/**
 * Get Octokit instance
 */
function getOctokit(): InstanceType<typeof GitHub> {
  const githubToken = core.getInput("token");
  return github.getOctokit(githubToken);
}

/**
 * Returns whether we are running in context of a Pull Request event
 */
export function isPullRequestEvent(): boolean {
  return github.context.eventName === "pull_request";
}

/**
 * Identifier of the current Pull Request
 */
export function getPullRequestId(): number {
  return github.context.issue.number;
}

/**
 * The current pull request's title
 */
export async function getPullRequestTitle(): Promise<string> {
  return (await getPullRequest(getPullRequestId())).title;
}

/**
 * Retrieves a list of commits associated with the specified Pull Request
 * @param pullRequestId GitHub Pullrequest ID
 * @returns List of commit objects
 */
export async function getCommits(
  pullRequestId: number
): Promise<
  octokit.RestEndpointMethodTypes["pulls"]["listCommits"]["response"]["data"]
> {
  // Retrieve commits from provided Pull Request
  const { data: commits } = await getOctokit().rest.pulls.listCommits({
    owner: OWNER,
    repo: REPO,
    pull_number: pullRequestId,
  });

  return commits;
}

/**
 * Retrieves the Pull Request associated with the specified Pull Request ID
 * @param pullRequestId GitHub Pullrequest ID
 * @returns Pull Request
 */
export async function getPullRequest(
  pullRequestId: number
): Promise<
  octokit.RestEndpointMethodTypes["pulls"]["get"]["response"]["data"]
> {
  const { data: pr } = await getOctokit().rest.pulls.get({
    owner: OWNER,
    repo: REPO,
    pull_number: pullRequestId,
  });

  return pr;
}

/**
 * Creates a GitHub release named `tag_name` on the main branch of the provided repo
 * @param tagName Name of the tag (and release)
 * @param commitish The commitish (ref, sha, ..) the release shall be made from
 */
export async function createRelease(
  tagName: string,
  commitish: string,
  body: string
): Promise<void> {
  await getOctokit().rest.repos.createRelease({
    owner: OWNER,
    repo: REPO,
    tag_name: tagName,
    target_commitish: commitish,
    name: tagName,
    body,
    draft: false,
    prerelease: false,
  });
}

/**
 * Creates a lightweight tag named `tag_name` on the provided sha
 * @param tagName Name of the tag
 * @param sha The SHA1 value of the tag
 */
export async function createTag(tagName: string, sha: string): Promise<void> {
  await getOctokit().rest.git.createRef({
    owner: OWNER,
    repo: REPO,
    ref: tagName.startsWith("refs/tags/") ? tagName : `refs/tags/${tagName}`,
    sha,
  });
}

/**
 * Downloads the requested configuration file in case it exists.
 * @param path Path towards the Commisery configuration file
 */
export async function getConfig(path: string): Promise<void> {
  const config = await getContent(path);
  if (config !== undefined) {
    fs.writeFileSync(".commisery.yml", config);
  }
}

/**
 * Downloads the release configuration (.github/release.y[a]ml) in the repository.
 * Return empty configuration if the file(s) do not exist.
 */
export async function getReleaseConfiguration(): Promise<string> {
  for (const path of [".github/release.yml", ".github/release.yaml"]) {
    const content = await getContent(path);
    if (content !== undefined) {
      return content;
    }
  }

  return "";
}

/**
 * Retrieve `pageSize` commits since specified hash in the current repo
 */
export async function getCommitsSince(
  sha: string,
  pageSize: number
): Promise<
  octokit.RestEndpointMethodTypes["repos"]["listCommits"]["response"]["data"]
> {
  const { data: commits } = await getOctokit().rest.repos.listCommits({
    owner: OWNER,
    repo: REPO,
    sha,
    per_page: pageSize,
  });

  return commits;
}

/**
 * Get the commit sha associated with the provided tag, or `undefined` if
 * the tag doesn't exist.
 */
export async function getShaForTag(tag: string): Promise<string | undefined> {
  interface graphqlQueryResult {
    repository: {
      ref: {
        target: {
          oid: string;
        };
      };
    };
  }

  if (!tag.startsWith("refs/tags/")) {
    tag = `refs/tags/${tag}`;
  }
  const result: graphqlQueryResult = await getOctokit().graphql(`
      {
        repository(owner: "${OWNER}", name: "${REPO}") {
          ref(qualifiedName: "${tag}") {
            target {
              oid
            }
          }
        }
      }
    `);

  return result.repository.ref?.target.oid;
}

/**
 * Retrieve `pageSize` tags in the current repo
 */
export async function getLatestTags(pageSize: number): Promise<IGitTag[]> {
  interface graphqlTagItem {
    node: {
      name: string;
      reftarget: {
        // `reftarget` can be a Commit object (if lightweight tag) or Tag object (if annotated tag)
        commitsha?: string;
        tagtarget?: {
          commitsha: string;
        };
      };
    };
  }

  interface graphqlQueryResult {
    repository: {
      refs: {
        edges: graphqlTagItem[];
      };
    };
  }

  const result: graphqlQueryResult = await getOctokit().graphql(`
      {
        repository(owner: "${OWNER}", name: "${REPO}") {
          refs(
            refPrefix: "refs/tags/"
            first: ${pageSize}
            orderBy: {field: TAG_COMMIT_DATE, direction: DESC}
          ) {
            edges {
              node {
                name
                reftarget: target {
                  ... on Commit {
                    commitsha:oid
                  }
                  ... on Tag {
                    tagtarget: target { commitsha: oid }
                  }
                }
              }
            }
          }
        }
      }
    `);

  const tagList: IGitTag[] = result.repository.refs.edges.map(
    x =>
      ({
        name: x.node.name,
        commitSha: x.node.reftarget.tagtarget
          ? x.node.reftarget.tagtarget.commitsha
          : x.node.reftarget.commitsha,
      } as IGitTag)
  );

  return tagList;
}

/**
 * Retrieve the Pull Requests associated with the specified commit SHA
 */
export async function getAssociatedPullRequests(
  sha: string
): Promise<
  octokit.RestEndpointMethodTypes["repos"]["listPullRequestsAssociatedWithCommit"]["response"]["data"]
> {
  try {
    const { data: prs } =
      await getOctokit().rest.repos.listPullRequestsAssociatedWithCommit({
        owner: OWNER,
        repo: REPO,
        commit_sha: sha,
      });

    return prs;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.message !== "Resource not accessible by integration") {
      throw error;
    }

    return [];
  }
}

/**
 * Updates the Pull Request (issue) labels
 */
export async function updateLabels(labels: string[]): Promise<void> {
  const issueId = getPullRequestId();

  // Retrieve current labels
  const { data: pullRequestLabels } =
    await getOctokit().rest.issues.listLabelsOnIssue({
      owner: OWNER,
      repo: REPO,
      issue_number: issueId,
    });

  try {
    // Remove all labels prefixed with "bump:" and "type:"
    for (const label of pullRequestLabels) {
      if (label.name.startsWith("bump:") || label.name.startsWith("type:")) {
        // Check if the label should remain, if not, remove the label from the Pull Request
        if (labels.includes(label.name)) {
          labels = labels.filter(l => l !== label.name);
        } else {
          await getOctokit().rest.issues.removeLabel({
            owner: OWNER,
            repo: REPO,
            issue_number: issueId,
            name: label.name,
          });
        }
      }
    }

    if (labels.length > 0) {
      // Add new label if it does not yet exist
      await getOctokit().rest.issues.addLabels({
        owner: OWNER,
        repo: REPO,
        issue_number: issueId,
        labels,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    if (error.message !== "Resource not accessible by integration") {
      throw error;
    }
    core.warning(
      "Unable to update Pull Request labels, did you provide the `write` permission for `issues` and `pull-requests`?"
    );
  }
}

/**
 * Downloads and returns the contents of the specified file path.
 */
export async function getContent(path: string): Promise<string | undefined> {
  try {
    const response = await getOctokit().rest.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path,
      ref: github.context.ref,
    });

    if ("content" in response.data) {
      return Buffer.from(response.data.content, "base64").toString("utf8");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    core.debug(error);
  }
}
