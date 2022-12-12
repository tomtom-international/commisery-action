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
import { SemVerType } from "./semver";

const [OWNER, REPO] = (process.env.GITHUB_REPOSITORY || "").split("/");

/**
 * Get Octokit instance
 */
function getOctokit(): InstanceType<typeof GitHub> {
  const github_token = core.getInput("token");
  return github.getOctokit(github_token);
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
 * @param pullrequest_id GitHub Pullrequest ID
 * @returns List of commit objects
 */
export async function getCommits(
  pullrequest_id: number
): Promise<
  octokit.RestEndpointMethodTypes["pulls"]["listCommits"]["response"]["data"]
> {
  // Retrieve commits from provided Pull Request
  const { data: commits } = await getOctokit().rest.pulls.listCommits({
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
export async function getPullRequest(
  pullrequest_id: number
): Promise<
  octokit.RestEndpointMethodTypes["pulls"]["get"]["response"]["data"]
> {
  const { data: pr } = await getOctokit().rest.pulls.get({
    owner: OWNER,
    repo: REPO,
    pull_number: pullrequest_id,
  });

  return pr;
}

/**
 * Creates a GitHub release named `tag_name` on the main branch of the provided repo
 * @param tag_name Name of the tag (and release)
 * @param commitish The commitish (ref, sha, ..) the release shall be made from
 */
export async function createRelease(
  tag_name: string,
  commitish: string,
  body: string
): Promise<void> {
  await getOctokit().rest.repos.createRelease({
    owner: OWNER,
    repo: REPO,
    tag_name,
    target_commitish: commitish,
    name: tag_name,
    body,
    draft: false,
    prerelease: false,
  });
}

/**
 * Creates a lightweight tag named `tag_name` on the provided sha
 * @param tag_name Name of the tag
 * @param sha The SHA1 value of the tag
 */
export async function createTag(tag_name: string, sha: string): Promise<void> {
  await getOctokit().rest.git.createRef({
    owner: OWNER,
    repo: REPO,
    ref: tag_name.startsWith("refs/tags/") ? tag_name : `refs/tags/${tag_name}`,
    sha,
  });
}

/**
 * Downloads the requested configuration file in case it exists.
 * @param path Path towards the Commisery configuration file
 */
export async function getConfig(path: string): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await getOctokit().rest.repos.getContent({
      owner: OWNER,
      repo: REPO,
      path,
      ref: github.context.ref,
    });

    const config_file = response.data;

    fs.writeFileSync(
      ".commisery.yml",
      Buffer.from(config_file.content, "base64")
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    core.debug(error);
    return;
  }
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
 * Updates the Pull Request (issue) labels to contain the SemVer bump level, in
 * the format: `bump:<version>`
 */
export async function updateSemVerLabel(semverType: SemVerType): Promise<void> {
  const issue_id = getPullRequestId();
  const expected_label = `bump:${SemVerType[semverType].toLowerCase()}`;
  let label_exists = false;

  // Retrieve current labels
  const { data: labels } = await getOctokit().rest.issues.listLabelsOnIssue({
    owner: OWNER,
    repo: REPO,
    issue_number: issue_id,
  });

  try {
    // Remove all labels prefixed with "Semver-"
    for (const lbl of labels) {
      if (lbl.name.startsWith("bump:")) {
        if (lbl.name === expected_label) {
          label_exists = true;
        } else {
          await getOctokit().rest.issues.removeLabel({
            owner: OWNER,
            repo: REPO,
            issue_number: issue_id,
            name: lbl.name,
          });
        }
      }
    }

    // Add new label if it does not yet exist
    if (label_exists === false && semverType !== SemVerType.NONE) {
      await getOctokit().rest.issues.addLabels({
        owner: OWNER,
        repo: REPO,
        issue_number: issue_id,
        labels: [expected_label],
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
