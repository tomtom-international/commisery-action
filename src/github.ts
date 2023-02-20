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
import { ICommit, IGitTag } from "./interfaces";
import { channel } from "diagnostics_channel";

const [OWNER, REPO] = (process.env.GITHUB_REPOSITORY || "").split("/");

/**
 * Get Octokit instance
 */
function getOctokit(): InstanceType<typeof GitHub> {
  const githubToken = core.getInput("token");
  return github.getOctokit(githubToken);
}

/**
 * @param commits[] List of commits as returned by GitHub API `/repos/listCommits`
 * @return List of ICommit objects representing the input list
 */
function githubCommitsAsICommits(
  commits: octokit.RestEndpointMethodTypes["repos"]["listCommits"]["response"]["data"]
): ICommit[] {
  return commits.map((c): ICommit => {
    return {
      message: c.commit.message,
      sha: c.sha,
    };
  });
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
 * Retrieves a list of commits associated with the specified pull request
 * @param pullRequestId GitHub pull request ID
 * @returns ICommit[] List of ICommit objects
 */
export async function getCommitsInPR(
  pullRequestId: number
): Promise<ICommit[]> {
  // Retrieve commits from provided pull request
  const { data: commits } = await getOctokit().rest.pulls.listCommits({
    owner: OWNER,
    repo: REPO,
    pull_number: pullRequestId,
  });

  return githubCommitsAsICommits(commits);
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
 * @param body The release's text description
 * @param draft Create this release as a 'draft' release
 */
export async function createRelease(
  tagName: string,
  commitish: string,
  body: string,
  draft: boolean
): Promise<void> {
  await getOctokit().rest.repos.createRelease({
    owner: OWNER,
    repo: REPO,
    tag_name: tagName,
    target_commitish: commitish,
    name: tagName,
    body,
    draft,
  });
}

/**
 * Gets the name and ID of the existing draft release with the
 * most precedence of which the tag name starts with the provided parameter.
 *
 * Returns an object {id, name}, or `undefined` if no tag was found.
 */
export async function getDraftRelease(
  nameStartsWith: string
): Promise<{ id: number; name: string } | undefined> {
  const result: {
    repository: {
      releases: {
        nodes: {
          databaseId: number;
          isDraft: boolean;
          tagName: string;
        }[];
      };
    };
  } = await getOctokit().graphql(`
    {
      repository(owner: "${OWNER}", name: "${REPO}") {
        releases(
          first: 100
          orderBy: {field: CREATED_AT, direction: DESC}
        ) {
          nodes {
            tagName
            isDraft
            databaseId
          }
        }
      }
    }
    `);

  core.debug(`getDraftRelease: GraphQL returned:\n${JSON.stringify(result)}`);

  /**
   * The GraphQL query has returned with a list the last 100 tags the repo.
   * This may be problematic in and of itself (TODO: pagination), but one thing
   * at a time for now.
   * We need to:
   *  - only consider draft releases
   *  - only consider releases starting with the provided parameter
   *  - _NOT_ rely on the temporal data; the precendence of the existing tags
   *    shall determined according to a "SemVer-esque prerelease", that is:
   *      * componentX-1.2.3-9 < componentX-1.2.3-10
   *    This code is not SemVer-aware, however; instead, it tries to get by with:
   *      * stripping off the provided `nameStartsWith` value, then
   *      * taking first number after the _first_ '-' it encounters.
   *        This means in the example above, `componentX-` ('-' included) must
   *        be the `nameStartsWith` value for the behavior to work as expected.
   *  - return the highest-precedence item
   */

  // Gets the first number after a '-' sign
  const RE = new RegExp(
    `^${nameStartsWith}${/\D*-\D*(?<version>\d+)\D*.*/.source}`
  );
  const sortedList = result.repository.releases.nodes
    .filter(r => r.isDraft)
    .filter(r => r.tagName.startsWith(nameStartsWith))
    .map(r => ({ id: r.databaseId, name: r.tagName }))
    .sort((lhs, rhs) => {
      const l = +(RE.exec(lhs.name)?.groups?.version ?? 0);
      const r = +(RE.exec(rhs.name)?.groups?.version ?? 0);
      for (const x of [
        [l, lhs],
        [r, rhs],
      ]) {
        if (!x[0])
          core.info(
            `warning: draft ${x[1]} is not a prerelease; ` +
              `it will receive lowest precedence`
          );
      }
      const sortResult: number = l === r ? 0 : l < r ? -1 : 1;
      core.debug(`sort: ${lhs.name} < ${rhs.name} = ${sortResult}`);
      return sortResult;
    });

  core.debug(`getDraftRelease: list of drafts:\n${JSON.stringify(sortedList)}`);
  return sortedList.pop();
}

/**
 * Updates a draft release with a new name.
 *
 * Returns `true` if successful
 */
export async function updateDraftRelease(
  id: number,
  newName: string,
  tagName: string,
  sha: string,
  bodyContents: string
): Promise<boolean> {
  core.debug(
    `Update existing draft release with id ${id} to ${newName} (${tagName}) sha: ${sha}, ` +
      `and body below:\n${bodyContents}`
  );
  const result = await getOctokit().rest.repos.updateRelease({
    owner: OWNER,
    repo: REPO,
    release_id: id,
    target_commitish: sha,
    draft: true,
    body: bodyContents,
    name: newName,
    tag_name: tagName,
  });

  return result.status < 400;
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
): Promise<ICommit[]> {
  const { data: commits } = await getOctokit().rest.repos.listCommits({
    owner: OWNER,
    repo: REPO,
    sha,
    per_page: pageSize,
  });

  return githubCommitsAsICommits(commits);
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
    core.debug((error as Error).message);
  }
}
