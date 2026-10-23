/**
 * Copyright (C) 2026, TomTom (http://tomtom.com).
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
import { RequestError } from "@octokit/request-error";
import {
  getAssociatedPullRequests,
  getCommitsBetweenRefs,
  getCommitsInPR,
  matchTagsToCommits,
  updateLabels,
} from "../src/github";
import { createTagMatcher } from "../src/bump";
import { SemVer } from "../src/semver";
import * as U from "./test_utils";

const mockListCommits = jest.fn();
const mockListPullRequestCommits = jest.fn();
const mockCompareCommits = jest.fn();
const mockIterator = jest.fn();
const mockListPullRequests = jest.fn();
const mockListLabels = jest.fn();
const mockAddLabels = jest.fn();
const mockRemoveLabel = jest.fn();

jest.mock("@actions/core");
jest.mock("@actions/github", () => ({
  context: {
    repo: { owner: "owner", repo: "repo" },
    issue: { number: 1 },
    sha: "aaaaaaa",
  },
}));
jest.mock("@actions/github/lib/utils", () => ({
  getOctokitOptions: jest.fn(),
  GitHub: {
    plugin: () =>
      class {
        rest = {
          repos: {
            listCommits: mockListCommits,
            compareCommitsWithBasehead: mockCompareCommits,
            listPullRequestsAssociatedWithCommit: mockListPullRequests,
          },
          pulls: {
            listCommits: mockListPullRequestCommits,
          },
          issues: {
            listLabelsOnIssue: mockListLabels,
            addLabels: mockAddLabels,
            removeLabel: mockRemoveLabel,
          },
        };
        paginate = { iterator: mockIterator };
      },
  },
}));

const ghCommit = (sha: string, message: string) => ({
  sha,
  commit: { message },
});

// Mirrors the following history, where the PR branch was started before 1.0.0
// was tagged, and the last two PR commits were made after it was tagged:
//
// *   aaaaaaa Merge pull request #2
// |\
// | * 9999999 refactor: address second review
// | * 8888888 refactor: address review
// | * 7777777 refactor: address lint findings
// | * 6666666 style: apply formatting
// | * 5555555 feat: add new feature
// * | 4444444 ci: update linter
// * | 3333333 ci: update workflow
// * | 2222222 (tag: 1.0.0) Merge pull request #1
// |/
// * 1111111 chore: update dependencies
const MERGE = ghCommit("aaaaaaa", "Merge pull request #2");
const REVIEW2 = ghCommit("9999999", "refactor: address second review");
const REVIEW1 = ghCommit("8888888", "refactor: address review");
const LINT = ghCommit("7777777", "refactor: address lint findings");
const STYLE = ghCommit("6666666", "style: apply formatting");
const FEAT = ghCommit("5555555", "feat: add new feature");
const CI_LINTER = ghCommit("4444444", "ci: update linter");
const CI_WORKFLOW = ghCommit("3333333", "ci: update workflow");
const TAGGED = ghCommit("2222222", "Merge pull request #1");
const BASE = ghCommit("1111111", "chore: update dependencies");

// Order returned by `listCommits`: by date, newest first
const BY_DATE = [
  MERGE,
  REVIEW2,
  REVIEW1,
  CI_LINTER,
  CI_WORKFLOW,
  TAGGED,
  LINT,
  STYLE,
  FEAT,
  BASE,
];

// Order returned by `compareCommitsWithBasehead(2222222...aaaaaaa)`: oldest first
const SINCE_TAG = [
  FEAT,
  STYLE,
  LINT,
  CI_WORKFLOW,
  CI_LINTER,
  REVIEW1,
  REVIEW2,
  MERGE,
];

const asPages = (...pages: object[]) =>
  (async function* () {
    for (const data of pages) yield { data };
  })();

const toICommit = (c: ReturnType<typeof ghCommit>) => ({
  sha: c.sha,
  message: c.commit.message,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("matchTagsToCommits", () => {
  const matcher = (sha: string): SemVer | null =>
    sha === TAGGED.sha ? SemVer.fromString("1.0.0") : null;

  test("includes branch commits that are older than the matched tag", async () => {
    mockIterator.mockImplementation(endpoint =>
      endpoint === mockListCommits
        ? asPages(BY_DATE)
        : asPages(
            { commits: SINCE_TAG.slice(0, 4) },
            { commits: SINCE_TAG.slice(4) }
          )
    );

    const [version, commits] = await matchTagsToCommits(MERGE.sha, matcher);

    expect(version?.toString()).toBe("1.0.0");
    expect(commits).toEqual([...SINCE_TAG].reverse().map(toICommit));
    expect(commits.map(c => c.sha)).toContain(FEAT.sha);
    expect(mockIterator).toHaveBeenLastCalledWith(mockCompareCommits, {
      owner: "owner",
      repo: "repo",
      basehead: `${TAGGED.sha}...${MERGE.sha}`,
      per_page: 100,
    });
  });

  test("returns no commits when the target commit is tagged", async () => {
    mockIterator.mockImplementation(endpoint =>
      endpoint === mockListCommits ? asPages(BY_DATE) : asPages({ commits: [] })
    );

    const [version, commits] = await matchTagsToCommits(MERGE.sha, sha =>
      sha === MERGE.sha ? SemVer.fromString("1.1.0") : null
    );

    expect(version?.toString()).toBe("1.1.0");
    expect(commits).toEqual([]);
  });

  test("returns all reachable commits when no tag matches", async () => {
    mockIterator.mockImplementation(() => asPages(BY_DATE));

    const [version, commits] = await matchTagsToCommits(MERGE.sha, () => null);

    expect(version).toBeNull();
    expect(commits).toEqual(BY_DATE.map(toICommit));
    expect(mockIterator).not.toHaveBeenCalledWith(
      mockCompareCommits,
      expect.anything()
    );
  });
});

describe("matchTagsToCommits on merged release branch", () => {
  // Mirrors the following history, where 1.0.1 was tagged on a release branch
  // _after_ 1.1.0 was tagged on master, and then merged into master:
  //
  // *   aaaaaaa Merge branch 'release/1.0'
  // |\
  // | * 4444444 (tag: 1.0.1) fix: hotfix
  // * | 3333333 feat: add feature
  // * | 2222222 (tag: 1.1.0) feat: add other feature
  // |/
  // * 1111111 (tag: 1.0.0) chore: update dependencies
  const MERGE_RELEASE = ghCommit("aaaaaaa", "Merge branch 'release/1.0'");
  const HOTFIX = ghCommit("4444444", "fix: hotfix");
  const FEATURE = ghCommit("3333333", "feat: add feature");
  const TAGGED_1_1_0 = ghCommit("2222222", "feat: add other feature");
  const TAGGED_1_0_0 = ghCommit("1111111", "chore: update dependencies");

  const TAGS: Record<string, string> = {
    [HOTFIX.sha]: "1.0.1",
    [TAGGED_1_1_0.sha]: "1.1.0",
    [TAGGED_1_0_0.sha]: "1.0.0",
  };
  const matcher = (sha: string): SemVer | null =>
    sha in TAGS ? SemVer.fromString(TAGS[sha]) : null;

  // `compareCommitsWithBasehead` results (oldest first), by base
  const COMPARE: Record<string, ReturnType<typeof ghCommit>[]> = {
    [HOTFIX.sha]: [TAGGED_1_1_0, FEATURE, MERGE_RELEASE],
    [TAGGED_1_1_0.sha]: [HOTFIX, FEATURE, MERGE_RELEASE],
  };

  test("uses the highest version reachable, not the first by date", async () => {
    mockIterator.mockImplementation((endpoint, params) =>
      endpoint === mockListCommits
        ? asPages([MERGE_RELEASE, HOTFIX, FEATURE, TAGGED_1_1_0, TAGGED_1_0_0])
        : asPages({ commits: COMPARE[params.basehead.split("...")[0]] })
    );

    const [version, commits] = await matchTagsToCommits(
      MERGE_RELEASE.sha,
      matcher
    );

    expect(version?.toString()).toBe("1.1.0");
    expect(commits).toEqual([MERGE_RELEASE, FEATURE, HOTFIX].map(toICommit));
    expect(mockIterator).toHaveBeenLastCalledWith(
      mockCompareCommits,
      expect.objectContaining({
        basehead: `${TAGGED_1_1_0.sha}...${MERGE_RELEASE.sha}`,
      })
    );
  });
});

describe("matchTagsToCommits at scale", () => {
  // Mirrors a repository with thousands of tags, none of which are on the target
  // branch apart from the one it was branched from, and hundreds of commits since:
  // the matcher is invoked for every commit since that tag.
  const TAG_COUNT = 5000;
  const COMMIT_COUNT = 700;
  const sha = (i: number) => i.toString(16).padStart(40, "0");
  const commits = Array.from({ length: COMMIT_COUNT }, (_, i) =>
    ghCommit(sha(i + 1), `feat: change ${i + 1}`)
  );
  const TAGGED_INDEX = COMMIT_COUNT - 1;
  const tags = Array.from({ length: TAG_COUNT }, (_, i) => ({
    name: `1.0.0-rc${i}`,
    ref: `refs/tags/1.0.0-rc${i}`,
    sha: `f${i.toString(16).padStart(39, "0")}`,
  }));
  tags.push({
    name: "2.0.0-rc01",
    ref: "refs/tags/2.0.0-rc01",
    sha: commits[TAGGED_INDEX].sha,
  });

  test("finds the tag with bounded log output", async () => {
    const debugOutput: string[] = [];
    (core.debug as jest.Mock).mockImplementation((msg: string) =>
      debugOutput.push(msg)
    );
    const sinceTag = commits.slice(0, TAGGED_INDEX).reverse(); // oldest first
    mockIterator.mockImplementation(endpoint =>
      endpoint === mockListCommits
        ? asPages(commits.slice(0, 350), commits.slice(350))
        : asPages(
            { commits: sinceTag.slice(0, 100) },
            { commits: sinceTag.slice(100) }
          )
    );

    const [version, result] = await matchTagsToCommits(
      commits[0].sha,
      createTagMatcher(tags, "*")
    );

    expect(version?.toString()).toBe("2.0.0-rc01");
    expect(result).toHaveLength(TAGGED_INDEX);
    expect(mockIterator).toHaveBeenLastCalledWith(
      mockCompareCommits,
      expect.objectContaining({
        basehead: `${commits[TAGGED_INDEX].sha}...${commits[0].sha}`,
      })
    );
    // Before indexing the tags, this logged one line per (commit, tag) pair:
    // ~3.5M lines and ~400 MB here, which crashes Node.js when written to stdout.
    const bytes = debugOutput.reduce((total, msg) => total + msg.length, 0);
    expect(bytes).toBeLessThan(200 * 1024);
  });
});

describe("getCommitsBetweenRefs", () => {
  test("collects commits from all pages", async () => {
    mockIterator.mockImplementation(() =>
      asPages(
        { commits: SINCE_TAG.slice(0, 4) },
        { commits: SINCE_TAG.slice(4) }
      )
    );

    const commits = await getCommitsBetweenRefs(TAGGED.sha);

    expect(commits).toEqual(SINCE_TAG.map(toICommit));
    expect(mockIterator).toHaveBeenCalledWith(mockCompareCommits, {
      owner: "owner",
      repo: "repo",
      basehead: `${TAGGED.sha}...aaaaaaa`,
      per_page: 100,
    });
  });
});

describe("getCommitsInPR", () => {
  const prCommits = (count: number) =>
    Array.from({ length: count }, (_, i) =>
      ghCommit(
        `${i}`.padStart(7, "0"),
        i === count - 1 ? "feat: last" : "docs: x"
      )
    );

  test("collects commits from all pages", async () => {
    const commits = prCommits(130);
    mockIterator.mockImplementation(() =>
      asPages(commits.slice(0, 100), commits.slice(100))
    );

    await expect(getCommitsInPR(1)).resolves.toEqual(commits.map(toICommit));
    expect(mockIterator).toHaveBeenCalledWith(mockListPullRequestCommits, {
      owner: "owner",
      repo: "repo",
      pull_number: 1,
      per_page: 100,
    });
    expect(core.warning).not.toHaveBeenCalled();
  });

  test("warns when the GitHub API limit of 250 commits is reached", async () => {
    const commits = prCommits(250);
    mockIterator.mockImplementation(() =>
      asPages(
        commits.slice(0, 100),
        commits.slice(100, 200),
        commits.slice(200)
      )
    );

    await expect(getCommitsInPR(1)).resolves.toHaveLength(250);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("at most 250 commits")
    );
  });
});

// Error as raised by Octokit when the token lacks the required permissions,
// e.g. the read-only `GITHUB_TOKEN` provided to Pull Requests from forks.
const notAccessibleError = (documentationUrl: string) =>
  new RequestError(
    `Resource not accessible by integration - ${documentationUrl}`,
    403,
    {
      request: { method: "POST", url: "https://example.com", headers: {} },
    }
  );

describe("getAssociatedPullRequests", () => {
  test("returns no pull requests when the token lacks permissions", async () => {
    mockListPullRequests.mockRejectedValue(
      notAccessibleError(
        "https://docs.github.com/rest/commits/commits#list-pull-requests-associated-with-a-commit"
      )
    );

    await expect(getAssociatedPullRequests(MERGE.sha)).resolves.toEqual([]);
  });

  test("rethrows other errors", async () => {
    mockListPullRequests.mockRejectedValue(U.getMockRequestError(500));

    await expect(getAssociatedPullRequests(MERGE.sha)).rejects.toThrow(
      "Mocked Error"
    );
  });
});

describe("updateLabels", () => {
  test("warns instead of failing when the token lacks permissions", async () => {
    mockListLabels.mockResolvedValue({ data: [] });
    mockAddLabels.mockRejectedValue(
      notAccessibleError(
        "https://docs.github.com/rest/issues/labels#add-labels-to-an-issue"
      )
    );

    await expect(updateLabels(["bump:minor"])).resolves.toBeUndefined();
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining("Unable to update Pull Request labels")
    );
  });

  test("rethrows other errors", async () => {
    mockListLabels.mockResolvedValue({ data: [] });
    mockAddLabels.mockRejectedValue(U.getMockRequestError(500));

    await expect(updateLabels(["bump:minor"])).rejects.toThrow("Mocked Error");
  });
});
