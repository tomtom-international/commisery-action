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
import { SemVer } from "./semver";
import * as Label from "./label";

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
 * Get GitHub run number
 */
export function getRunNumber(): number {
  return github.context.runNumber;
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
    ...github.context.repo,
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
    ...github.context.repo,
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
  draft: boolean,
  prerelease: boolean
): Promise<void> {
  await getOctokit().rest.repos.createRelease({
    ...github.context.repo,
    tag_name: tagName,
    target_commitish: commitish,
    name: tagName,
    body,
    draft,
    prerelease,
  });
}

function sortVersionPrereleases(
  releaseList: { id: number; name: string }[],
  nameStartsWith
): { id: number; name: string }[] {
  return releaseList.sort((lhs, rhs) => SemVer.sortSemVer(lhs.name, rhs.name));
}

/**
 * Gets the name and ID of the existing (draft) release with the
 * most precedence of which the tag name starts with the provided parameter.
 * If `fullReleasesOnly` is set, only consider full releases (i.e. without a
 * SemVer prerelease field).
 *
 * Returns an object {id, name}, or `undefined` if no tag was found.
 */
export async function getRelease(params: {
  prefixToMatch: string;
  draftOnly: boolean;
  fullReleasesOnly: boolean;
  constraint?: { major: number; minor: number };
}): Promise<{ id: number; name: string } | undefined> {
  core.info(
    `getRelease: finding ${
      params.draftOnly ? "draft " : ""
    }release with the prefix: ${params.prefixToMatch}`
  );
  const octo = getOctokit();

  const result = (
    await octo.paginate(octo.rest.repos.listReleases, {
      ...github.context.repo,
    })
  ).map(r => ({ isDraft: r.draft, tagName: r.tag_name, id: r.id }));

  core.debug(`getRelease: listReleases returned:\n${JSON.stringify(result)}`);

  /**
   * We need to:
   *  - only consider releases starting with the provided prefix, draft and
   *    release parameters
   *  - consider the major/minor constraint, if provided
   *  - _NOT_ rely on the temporal data; the precendence of the existing tags
   *    shall determined according to a "SemVer-esque prerelease", that is:
   *      * componentX-1.2.3-9 < componentX-1.2.3-10
   *  - return the highest-precedence item
   */

  const releaseList = result
    .filter(r => r.isDraft === params.draftOnly)
    .filter(r => {
      const asSemVer = SemVer.fromString(r.tagName);
      return (
        asSemVer?.prefix === params.prefixToMatch &&
        (params.fullReleasesOnly ? asSemVer?.prerelease === "" : true)
      );
    })
    .map(r => ({ id: r.id, name: r.tagName }))
    .sort((lhs, rhs) => SemVer.sortSemVer(lhs.name, rhs.name));

  core.debug(
    `getRelease: sorted list of releases:\n${JSON.stringify(releaseList)}`
  );

  if (params.constraint) {
    // We're sorted by precedence, highest last, so let's reverse it and we can
    // take the first major/minor version lower than the constraint we encounter.
    releaseList.reverse();
    for (const r of releaseList) {
      core.debug(
        `checking release ${r.name} against constraint ` +
          `${params.constraint.major}.${params.constraint.minor}.*`
      );
      const sv = SemVer.fromString(r.name);
      if (
        sv &&
        sv.major <= params.constraint.major &&
        sv.minor <= params.constraint.minor
      ) {
        return r;
      }
    }
    return;
  }
  return releaseList.pop();
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
  bodyContents: string,
  isDraft = true,
  isPrerelease = false
): Promise<boolean> {
  core.debug(
    `Update existing draft release with id ${id} to ${newName} (${tagName}) sha: ${sha}, ` +
      `and body below:\n${bodyContents}`
  );
  const result = await getOctokit().rest.repos.updateRelease({
    ...github.context.repo,
    release_id: id,
    target_commitish: sha,
    draft: isDraft,
    prerelease: isPrerelease,
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
    ...github.context.repo,
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
 * Runs the provided matcher function to a list of commits reachable from the provided
 * `sha`, or GitHub's `context.sha` if undefined.
 * Takes a `matcher` function, and executes it on each commit in the repository.
 *
 * When (if) the matcher function returns a SemVer object, this function shall
 * return that object along with the list of commits encountered up until now.
 *
 * Alternatively, if no match could be made, returns `null` along with all
 * the commits encountered.
 */
export async function matchTagsToCommits(
  sha: string | undefined,
  matcher: (msg: string, hash: string) => SemVer | null
): Promise<[SemVer | null, ICommit[]]> {
  const octo = getOctokit();
  const commitList: ICommit[] = [];
  let match: SemVer | null = null;
  sha = sha ?? github.context.sha;
  for await (const resp of octo.paginate.iterator(octo.rest.repos.listCommits, {
    ...github.context.repo,
    sha,
  })) {
    for (const commit of resp.data) {
      match = matcher(commit.commit.message, commit.sha);
      if (match) {
        core.debug(
          `Matching on (${commit.sha}):${commit.commit.message.split("\n")[0]}`
        );
        return [match, commitList];
      }
      commitList.push({ message: commit.commit.message, sha: commit.sha });
    }
  }
  return [match, commitList];
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
        repository(owner: "${github.context.repo.owner}", name: "${github.context.repo.repo}") {
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
        repository(owner: "${github.context.repo.owner}", name: "${github.context.repo.repo}") {
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
        ...github.context.repo,
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
      ...github.context.repo,
      issue_number: issueId,
    });

  try {
    // Remove all bump, type and initial development labels
    for (const label of pullRequestLabels) {
      if (Label.isManaged(label.name)) {
        // Check if the label should remain, if not, remove the label from the Pull Request
        if (labels.includes(label.name)) {
          labels = labels.filter(l => l !== label.name);
        } else {
          await getOctokit().rest.issues.removeLabel({
            ...github.context.repo,
            issue_number: issueId,
            name: label.name,
          });
        }
      }
    }

    if (labels.length > 0) {
      // Add new label if it does not yet exist
      await getOctokit().rest.issues.addLabels({
        ...github.context.repo,
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
      ...github.context.repo,
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

/**
 * Returns `true` if `context.sha` matches the sha of the tag `tagName`.
 */
export async function currentHeadMatchesTag(tagName: string): Promise<boolean> {
  return (await getShaForTag(tagName)) === github.context.sha;
}

/**
 * Returns the commits between two Git refs.
 * According to the docs, the behavior matches `baseRef...compRef`, with an additional
 * "chronological" order (unsure if commit- or author-date).
 *
 * Returns a list ICommits representing `baseRef...compRef`.
 */
export async function getCommitsBetweenRefs(
  baseRef: string,
  compRef?: string
): Promise<ICommit[]> {
  const { data: resp } =
    await getOctokit().rest.repos.compareCommitsWithBasehead({
      ...github.context.repo,
      basehead: `${baseRef}...${compRef ?? github.context.sha}`,
    });

  return githubCommitsAsICommits(resp.commits);
}

/**
 * Creates a new branch named `branchName` on the provided sha
 * @param name The name of the branch to be created
 * @param sha The commit hash of the branch-off point
 */
export async function createBranch(name: string, sha: string): Promise<void> {
  await getOctokit().rest.git.createRef({
    ...github.context.repo,
    ref: name.startsWith("refs/heads/") ? name : `refs/heads/${name}`,
    sha,
  });
}
