/**
 * Copyright (C) 2025, TomTom (http://tomtom.com).
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

import { generateChangelog } from "../changelog";
import { Configuration } from "../config";
import {
  createRelease,
  getAllTags,
  getRelease,
  isPullRequestEvent,
  matchTagsToCommits,
  updateDraftRelease,
} from "../github";
import { ConventionalCommitMessage } from "../commit";
import { SemVer, SemVerType } from "../semver";
import {
  IValidationResult,
  IVersionBumpTypeAndMessages,
  ReleaseMode,
  IVersionOutput,
  IGitHubRelease,
  ReleaseType,
  IBumpInfo,
} from "../interfaces";
import { outputCommitListErrors } from "../validate";
import { processCommitsForBump, publishBump, shortSha } from "./bump";

/**
 * Returns a SemVer object if:
 *  - the `tagSha` and `commitSha` match
 *  - the `tagName` tag reference is SemVer-compatible
 *  - the `prefix` exactly matches the `tagName`'s prefix (if any),
      or the provided `prefix` is "*"
 *
 * @param prefix Specifies the exact prefix of the tags to be considered,
 *               '*' means "any"
 * @param tagName The tag reference name
 * @param tagSha The tag's SHA1 hash
 * @param commitSha The SHA1 hash to compare to
 *
 * @return {Semver | null} A SemVer object representing the value of `tagName`,
 *                         or `null` if the provided parameters don't match
 */
function getSemVerIfMatches(
  prefix: string,
  tagName: string,
  tagSha: string,
  commitSha: string
): SemVer | null {
  if (commitSha === tagSha) {
    const dbg = (tag: string, commit: string, message: string): void => {
      core.debug(`Tag '${tag}' on commit '${commit.slice(0, 6)}' ${message}`);
    };
    const sv: SemVer | null = SemVer.fromString(tagName);
    if (sv) {
      // If provided, make sure that the prefix matches as well
      // Asterisk is a special case, meaning 'any prefix'
      if (sv.prefix === prefix || prefix === "*") {
        dbg(tagName, commitSha, `matches prefix ${prefix}`);
        return sv;
      }
      dbg(tagName, commitSha, `does not match prefix ${prefix}`);
    } else {
      dbg(tagName, commitSha, "is not a SemVer");
    }
  }

  return null;
}

/**
 * Determines the highest SemVer bump level based on the provided
 * list of Conventional Commits
 */
export function getVersionBumpType(
  messages: ConventionalCommitMessage[]
): SemVerType {
  let highestBump: SemVerType = SemVerType.NONE;

  for (const message of messages) {
    if (highestBump !== SemVerType.MAJOR) {
      core.debug(
        `Commit type '${message.type}'${
          message.breakingChange ? " (BREAKING)" : ""
        }, has bump type: ${SemVerType[message.bump]}`
      );
      highestBump = message.bump > highestBump ? message.bump : highestBump;
    }
  }

  return highestBump;
}

/**
 * Within the current context, examine all commits reachable from from `context.sha`
 * and match them to _all_ the tags found in the repo.
 * Each commit shall be tried to be matched to any of the tags found in chronological
 * order (i.e. the time the tag was pushed).
 * The closest tag that is SemVer-compatible and matches the `prefix` value as
 * configured in the `config` object shall be returned as a SemVer object, and
 * the highest bump type encountered in the commits _since_ that tag shall be returned.
 *  - MAJOR: breaking changes,
 *  - MINOR: feat commits,
 *  - PATCH: fix commits, plus any tag matching one of `extra_patch_tags`, if configured
 *
 * @param targetSha The sha on which to start listing commits
 * @param config A Configuration object, which optionally contains the `prefix` value
 *               that processed versions must match, or a list of Conventional Commit type
 *               tags that should bump the patch version field (aside from "fix").
 *
 * @return {IVersionBumpTypeAndMessages}
                 returns an object containing:
                 - the SemVer object or null if no (acceptable) SemVer was found.
                 - the highest bump encountered, or SemVerType.NONE if [0] is null
                 - list of ConventionalCommitMessage objects up to the found SemVer tag
                 - state of "initial development"; if no version is found, err on the
                   safe side and declare "initial development" (if configured as such)
 */
export async function getVersionBumpTypeAndMessages(
  targetSha: string,
  config: Configuration
): Promise<IVersionBumpTypeAndMessages> {
  core.debug("Fetching repository tags..");
  const tags = await getAllTags();
  core.debug(`Fetch complete; found ${tags.length} tags`);
  const tagMatcher = (commitSha: string): SemVer | null => {
    // Try and match this commit's hash to one of the tags in `tags`
    for (const tag of tags) {
      let semVer: SemVer | null = null;
      core.debug(`Considering tag ${tag.name} (${tag.sha}) on ${commitSha}`);
      semVer = getSemVerIfMatches(
        config.versionPrefix,
        tag.name,
        tag.sha,
        commitSha
      );
      if (semVer) {
        // We've found a tag that matches to this commit. Now, we need to make sure that
        // we return the _highest_ version tag associated with this commit.
        core.debug(
          `Matching tag found (${tag.name}), checking other tags for commit ${commitSha}..`
        );
        const matchTags = tags.filter(t => t.sha === commitSha);
        if (matchTags.length > 1) {
          core.debug(`${matchTags.length} other tags found`);
          matchTags.sort((lhs, rhs) => SemVer.sortSemVer(lhs.name, rhs.name));
          semVer = null;
          while (semVer === null && matchTags.length !== 0) {
            const t = matchTags.pop();
            if (!t) break;
            semVer = getSemVerIfMatches(
              config.versionPrefix,
              t.name,
              t.sha,
              commitSha
            );
          }
        } else {
          core.debug(`No other tags found`);
          // Just the one tag; carry on.
        }

        return semVer;
      }
    }
    core.debug(`Commit ${commitSha.slice(0, 6)} is not associated with a tag`);
    return null;
  };
  const [version, commitList] = await matchTagsToCommits(targetSha, tagMatcher);

  const results = processCommitsForBump(commitList, config);
  const convCommits = results
    .map(r => r.message)
    .filter((r): r is ConventionalCommitMessage => r !== undefined);

  return {
    foundVersion: version,
    requiredBump: getVersionBumpType(convCommits),
    processedCommits: results,
    initialDevelopment:
      config.initialDevelopment &&
      (!version || (version && version.major === 0)),
  };
}

/**
 * Tries to update an existing draft GitHub release.
 * Not prerelease-type-aware, and only succeeds if a prerelease
 * version already exists. Behavior:
 *   1.2.3-dev4     -> 1.2.3-dev5
 *   2.3.4-alpha104 -> 2.3.4-alpha105
 *   3.4.5-rc1      -> 3.4.5-rc2
 *   4.5.6          -> undefined
 *
 * Returns the new prerelease version name if update was successful,
 * `undefined` otherwise.
 */
async function tryUpdateDraftRelease(
  cv: SemVer,
  changelog: string,
  sha: string
): Promise<IGitHubRelease | undefined> {
  const latestDraftRelease = await getRelease({
    prefixToMatch: cv.prefix,
    draftOnly: true,
    fullReleasesOnly: false,
  });
  if (!latestDraftRelease) return;

  const currentDraftVersion = SemVer.fromString(latestDraftRelease.name);
  if (!currentDraftVersion) {
    core.info(`Couldn't parse ${latestDraftRelease.name} as SemVer`);
    return;
  }

  const npv = currentDraftVersion.nextPrerelease();
  if (!npv) return;
  npv.build = shortSha(sha);

  const updatedRelease = await updateDraftRelease(
    latestDraftRelease.id,
    npv.toString(),
    npv.toString(),
    sha,
    changelog
  );
  if (!updatedRelease) {
    core.info(`Error renaming existing draft release.`);
  }

  return updatedRelease;
}

async function newDraftRelease(
  currentVersion: SemVer,
  changelog: string,
  sha: string,
  prefix: string
): Promise<IGitHubRelease | undefined> {
  // Either update went wrong or there was nothing to update
  const nextPrereleaseVersion = currentVersion.nextPatch();
  nextPrereleaseVersion.build = currentVersion.build;
  if (prefix === "dev") {
    nextPrereleaseVersion.prerelease = `${prefix}001.${shortSha(sha)}`;
  } else {
    nextPrereleaseVersion.prerelease = `${prefix}001`;
  }
  const newRelease = await createRelease(
    nextPrereleaseVersion.toString(),
    sha,
    changelog,
    true,
    false
  );

  return newRelease;
}

export async function bumpDraftRelease(
  bumpInfo: IVersionBumpTypeAndMessages,
  changelog: string,
  sha: string,
  preRelPrefix: string
): Promise<IGitHubRelease | undefined> {
  const cv = bumpInfo.foundVersion;
  if (!cv) throw Error("Found version is falsy"); // should never happen
  const result =
    (await tryUpdateDraftRelease(cv, changelog, sha)) ??
    (await newDraftRelease(cv, changelog, sha, preRelPrefix));

  if (result) {
    core.info(`ℹ️ Next prerelease: ${result.name}`);
  } else {
    core.warning(`⚠️ No prerelease created.`);
  }

  return result;
}

/**
 * Prints information about any non-compliance found in the provided list
 */
export function printNonCompliance(commits: IValidationResult[]): void {
  const nonCompliantCommits = commits.filter(c => !c.message);

  if (nonCompliantCommits.length > 0) {
    const totalLen = commits.length;
    const ncLen = nonCompliantCommits.length;

    core.info(""); // for vertical whitespace

    if (ncLen === totalLen) {
      const commitsDoNotComply =
        totalLen === 1
          ? "The only encountered commit does not comply"
          : `None of the encountered ${totalLen} commits comply`;

      core.warning(
        `${commitsDoNotComply} with the Conventional Commits specification, ` +
          "so the intended bump level could not be determined.\n" +
          "As a result, no version bump will be performed."
      );
    } else {
      const [pluralDo, pluralBe] = ncLen === 1 ? ["does", "is"] : ["do", "are"];

      core.warning(
        `${ncLen} of the encountered ${totalLen} commits ` +
          `${pluralDo} not comply with the Conventional Commits ` +
          `specification and ${pluralBe} therefore NOT considered ` +
          "while determining the bump level."
      );
    }
    const pluralS = ncLen === 1 ? "" : "s";
    core.info(`⚠️ Non-compliant commit${pluralS}:`);
    outputCommitListErrors(nonCompliantCommits, false);
  }
}

export async function bumpSemVer(
  config: Configuration,
  bumpInfo: IVersionBumpTypeAndMessages,
  releaseMode: ReleaseMode,
  branchName: string,
  headSha: string,
  isBranchAllowedToPublish: boolean,
  createChangelog: boolean
): Promise<IVersionOutput | undefined> {
  const compliantCommits = bumpInfo.processedCommits
    .filter(c => c.message !== undefined)
    .map(c => ({
      msg: c.message as ConventionalCommitMessage,
      sha: c.input.sha.slice(0, 8),
    }));

  for (const { msg, sha } of compliantCommits) {
    const bumpString = msg.bump === 0 ? "No" : SemVerType[msg.bump];
    core.info(`- ${bumpString} bump for commit (${sha}): ${msg.subject}`);
  }

  // Reject MAJOR and MINOR version bumps if we're on a release branch
  // (Purposefully do this check _after_ listing the processed commits.)
  if (
    new RegExp(config.releaseBranches).test(branchName) &&
    [SemVerType.MAJOR, SemVerType.MINOR].includes(bumpInfo.requiredBump)
  ) {
    core.setFailed(
      `A ${SemVerType[bumpInfo.requiredBump]} bump is requested, but ` +
        `we can only create PATCH bumps on a release branch.`
    );
    return;
  }

  let bumpMetadata: IBumpInfo | undefined;

  if (bumpInfo.foundVersion) {
    const bumpResult = bumpInfo.foundVersion.bump(
      bumpInfo.requiredBump,
      config.initialDevelopment
    );
    if (bumpResult) {
      bumpMetadata = {
        from: bumpInfo.foundVersion,
        to: bumpResult.version,
        type: SemVerType[bumpResult.increment].toLowerCase() as ReleaseType,
      };
    }
  }

  let versionMetadata: IVersionOutput | undefined;

  let bumped = false;

  let changelog = "";
  if (createChangelog) changelog = await generateChangelog(bumpInfo);

  if (bumpMetadata) {
    const buildMetadata = core.getInput("build-metadata");
    if (buildMetadata) {
      bumpMetadata.to.build = buildMetadata;
    }

    const { release, tag } = await publishBump(
      bumpMetadata.to,
      releaseMode,
      headSha,
      changelog,
      isBranchAllowedToPublish,
      config.releaseDiscussionCategory
    );

    versionMetadata = {
      bump: {
        from: bumpMetadata.from.toString(),
        to: bumpMetadata.to.toString(),
        type: bumpMetadata.type as ReleaseType,
      },
      tag,
      release,
    };

    // If we have a release and/or a tag, we consider the bump successful
    bumped = release !== undefined || tag !== undefined;
  } else {
    core.info("ℹ️ No bump necessary");
  }
  core.endGroup();

  if (!bumped && config.prereleasePrefix !== undefined) {
    // When configured to create GitHub releases, and the `bump-prereleases` config item
    // evaluates to `true`.
    if (
      isBranchAllowedToPublish &&
      !isPullRequestEvent() &&
      releaseMode === "release"
    ) {
      // Create/rename draft release
      const draftRelease = await bumpDraftRelease(
        bumpInfo,
        changelog,
        headSha,
        config.prereleasePrefix
      );

      if (!draftRelease) {
        return;
      }

      core.info(`ℹ️ Created draft prerelease version ${draftRelease.name}`);
      if (!bumpInfo.foundVersion) throw Error("Found version is falsy"); // should never happen

      return {
        release: draftRelease,
        bump: {
          from: bumpInfo.foundVersion.toString(),
          to: draftRelease.name,
          type: "prerelease",
        },
      };
    } else {
      const reason =
        isBranchAllowedToPublish !== true
          ? `the current branch is not allowed to publish`
          : isPullRequestEvent()
            ? "we cannot publish from a pull request event"
            : releaseMode !== "release"
              ? `we can only do so when the 'create-release' input is provided to be 'true'`
              : "we didn't think of writing an error message here";
      core.info(`ℹ️ While configured to bump prereleases, ${reason}.`);
    }
  }

  return bumped ? versionMetadata : undefined;
}
