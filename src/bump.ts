/**
 * Copyright (C) 2022, TomTom (http://tomtom.com).
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

import { generateChangelogForCommits, generateChangelog } from "./changelog";
import { Configuration } from "./config";
import {
  createBranch,
  createRelease,
  createTag,
  currentHeadMatchesTag,
  getCommitsBetweenRefs,
  getRunNumber,
  getAllTags,
  getRelease,
  getShaForTag,
  isPullRequestEvent,
  matchTagsToCommits,
  updateDraftRelease,
} from "./github";
import { ConventionalCommitMessage } from "./commit";
import { SemVer, SemVerType } from "./semver";
import { BumpError } from "./errors";
import {
  ICommit,
  IValidationResult,
  IVersionBumpTypeAndMessages,
  ReleaseMode,
  SdkVerBumpType,
  IVersionOutput,
  IGitHubRelease,
  IGitTag,
  ReleaseType,
  IBumpInfo,
} from "./interfaces";
import { outputCommitListErrors, processCommits } from "./validate";

const RC_PREFIX = "rc";

/**
 * Return the first eight characters of a string.
 *
 * To be used as a shortened version of the 40-character SHA1 version.
 */
function shortSha(sha: string): string {
  return sha.substring(0, 8);
}

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

/** Validates a list of commits in a bump context, which differs slightly to
 * pull request validation runs, as some rules need to be disabled.
 */
function processCommitsForBump(
  commits: ICommit[],
  config: Configuration
): IValidationResult[] {
  // We'll relax certain rules while processing these commits; these are
  // commits/pull request titles that (ideally) have been validated
  // _before_ they were merged, and certain GitHub CI settings may append
  // a reference to the PR number in merge commits.
  const configCopy = config.copy();
  configCopy.setRuleActive("C014", false); // SubjectExceedsLineLengthLimit
  configCopy.setRuleActive("C019", false); // SubjectContainsIssueReference

  return processCommits(commits, configCopy);
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

export async function publishBump(
  nextVersion: SemVer,
  releaseMode: ReleaseMode,
  headSha: string,
  changelog: string,
  isBranchAllowedToPublish: boolean,
  discussionCategoryName?: string,
  updateDraftId?: number
): Promise<{ release?: IGitHubRelease; tag?: IGitTag }> {
  let releaseMetadata: IGitHubRelease | undefined;
  let tagMetadata: IGitTag | undefined;

  const nv = nextVersion.toString();
  core.info(`ℹ️ Next version: ${nv}`);
  core.endGroup();
  if (releaseMode !== "none") {
    if (!isBranchAllowedToPublish) {
      return {};
    }
    if (isPullRequestEvent()) {
      core.startGroup(
        `ℹ️ Not creating ${releaseMode} on a pull request event.`
      );
      core.info(
        "We cannot create a release or tag in a pull request context, due to " +
          "potential parallelism (i.e. races) in pull request builds."
      );
      return {};
    }
    core.startGroup(`ℹ️ Creating ${releaseMode} ${nv}..`);
    try {
      if (releaseMode === "tag") {
        tagMetadata = await createTag(nv, headSha);
      } else {
        // If version is a prerelease, but not an RC, create a draft release
        // If version is an RC, create a GitHub "pre-release"
        const isRc = nextVersion.prerelease.startsWith(RC_PREFIX);
        const isDev = nextVersion.prerelease !== "" && !isRc;
        if (updateDraftId) {
          releaseMetadata = await updateDraftRelease(
            updateDraftId,
            nv,
            nv,
            headSha,
            changelog,
            isDev, // draft
            isRc // prerelease
          );

          if (!releaseMetadata) {
            core.info(
              `Error renaming existing draft release, ` +
                `creating new draft release.`
            );
          }
        }

        if (!releaseMetadata) {
          releaseMetadata = await createRelease(
            nv,
            headSha,
            changelog,
            isDev,
            isRc,
            discussionCategoryName
          );

          // Only set the tag information in case we created a release
          // which implicitly creates a tag (i.e. not applicable for draft-releases).
          if (releaseMetadata) {
            tagMetadata = {
              name: releaseMetadata.name,
              ref: `refs/tags/${releaseMetadata.name}`,
              sha: headSha,
            };
          }
        }
      }
    } catch (ex: unknown) {
      // The most likely failure is a preexisting tag, in which case
      // a RequestError with statuscode 422 will be thrown
      const commit = await getShaForTag(`refs/tags/${nv}`);
      if (ex instanceof RequestError && ex.status === 422 && commit) {
        core.setFailed(
          `Unable to create ${releaseMode}; the tag "${nv}" already exists in the repository, ` +
            `it currently points to ${commit}.\n` +
            "You can find the branch(es) associated with the tag with:\n" +
            `  git fetch -t; git branch --contains ${nv}`
        );
      } else if (ex instanceof RequestError) {
        core.setFailed(
          `Unable to create ${releaseMode} with the name "${nv}" due to ` +
            `HTTP request error (status ${ex.status}):\n${ex.message}`
        );
      } else if (ex instanceof Error) {
        core.setFailed(
          `Unable to create ${releaseMode} with the name "${nv}":\n${ex.message}`
        );
      } else {
        core.setFailed(`Unknown error during ${releaseMode} creation`);
        throw ex;
      }
      core.endGroup();
      return {};
    }
    core.info("Succeeded");
  } else {
    core.startGroup(`ℹ️ Not creating tag or release for ${nv}..`);
    core.info(
      "To create a lightweight Git tag or GitHub release when the version is bumped, run this action with:\n" +
        ' - "create-release" set to "true" to create a GitHub release, or\n' +
        ' - "create-tag" set to "true" for a lightweight Git tag.\n' +
        "Note that setting both options is not needed, since a GitHub release implicitly creates a Git tag."
    );
    return {};
  }

  return {
    release: releaseMetadata,
    tag: tagMetadata,
  };
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

  let bumped = false;

  let changelog = "";
  if (createChangelog) changelog = await generateChangelog(bumpInfo);

  let versionMetadata: IVersionOutput | undefined;
  if (bumpMetadata) {
    versionMetadata = {
      bump: {
        from: bumpMetadata.from.toString(),
        to: bumpMetadata.to.toString(),
        type: bumpMetadata.type as ReleaseType,
      },
    };

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

    versionMetadata = { ...versionMetadata, release, tag };

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

  return bumped || releaseMode === "none" ? versionMetadata : undefined;
}

function getNextSdkVer(
  currentVersion: SemVer,
  sdkVerBumpType: SdkVerBumpType,
  isReleaseBranch: boolean,
  headMatchesTag: boolean,
  hasBreakingChange: boolean,
  devPrereleaseText: string,
  headSha: string,
  isInitialDevelopment: boolean
): IBumpInfo | undefined {
  const currentIsRc = currentVersion.prerelease.startsWith(RC_PREFIX);
  const currentIsRel = currentVersion.prerelease === "";

  const fatal = (msg: string): void => {
    throw new BumpError(msg);
  };
  const bumpOrError = (t: SemVerType): SemVer => {
    const bumpResult = currentVersion.bump(t, isInitialDevelopment);
    if (!bumpResult?.version) {
      throw new BumpError(`Bump ${t.toString()} for ${currentVersion} failed`);
    }
    return bumpResult.version;
  };

  core.info(`Determining SDK bump for version ${currentVersion.toString()}:`);
  core.info(
    ` - current version type: ${
      currentIsRel ? "release" : currentIsRc ? "release candidate" : "dev"
    }`
  );
  core.info(` - bump type: ${sdkVerBumpType}`);
  core.info(` - branch type: ${isReleaseBranch ? "" : "not "}release`);
  core.info(` - breaking changes: ${hasBreakingChange ? "yes" : "no"}`);

  let nextVersion: SemVer | null = null;
  let nextBumpType: SdkVerBumpType | null = null;

  if (isReleaseBranch) {
    // If current branch HEAD is a release candidate:
    //   !createRel && !createRc = bump rc-val
    //   !createRel &&  createRc = bump rc-val
    //    createRel && !createRc = promote to full release
    // Else if current branch HEAD is a full release:
    //   !createRel && !createRc = bump fix version (patch field)
    //   !createRel &&  createRc = error
    //    createRel && !createRc = bump fix version (patch field)
    // Else
    //   error

    if (!currentIsRc && !currentIsRel) {
      fatal(
        "Release branches can only contain release candidates or full releases. " +
          `'${currentVersion.toString()}' is neither.`
      );
    }
    // Special case: we allow breaking changes on a release branch if that
    // release branch still contains an RC for the next API version, in which
    // case, the MINOR and PATCH fields will be 0 (1.2.3 -> 2.0.0-rc1)
    if (
      hasBreakingChange &&
      !(currentIsRc && currentVersion.minor === 0 && currentVersion.patch === 0)
    ) {
      fatal("Breaking changes are not allowed on release branches.");
    }

    // Only bump if we need to; we don't want to generate a new RC or release
    // when nothing has changed since the last RC or release, unless it is a
    // promotion from RC to full release.
    if (headMatchesTag && !(sdkVerBumpType === "rel" && currentIsRc)) {
      core.info(` - head matches latest tag on release branch`);
    } else if (sdkVerBumpType === "rel") {
      if (currentIsRel) {
        // Pushes on release branches with a finalized release always
        // bump PATCH, no exception.
        nextVersion = bumpOrError(SemVerType.PATCH);
        nextBumpType = "rel";
      } else if (currentIsRc) {
        // A release bump on a release candidate results in a full release
        const nv = SemVer.copy(currentVersion);
        nv.prerelease = "";
        nextVersion = nv;
        nextBumpType = "rel";
      }
    } else {
      // Bumps for "rc" and "dev" are identical on a release branch
      if (currentIsRc) {
        // We need to keep the pre intact (undefined), but the post needs to be
        // cleared, as that contains the commit hash of the previous dev version.
        // Also zero pad to at least two digits.
        nextVersion = currentVersion.nextPrerelease(undefined, "", 2);
        nextBumpType = "rc";
        if (!nextVersion) {
          fatal(
            `Unable to bump RC version for: ${currentVersion.toString()}; ` +
              `make sure it contains an index number.`
          );
        }
      } else {
        // Current version is a release, so bump patch
        nextVersion = bumpOrError(SemVerType.PATCH);
        nextBumpType = "rel";
      }
    }
  } else {
    // !isReleaseBranch
    //   If current branch HEAD is a release candidate:
    //     dev bump                   = bump dev prerelease for next minor (do nothing here)
    //     rc bump                    = create new rc for _next_ version
    //     rel && rc_sha == head_sha  = "promote" to new full release
    //     rel && rc_sha != head_sha  = create full release for _next_ major
    //   Else if current branch HEAD is a full release:
    //     !createRel && !createRc = bump dev prerelease for next minor (do nothing here)
    //     !createRel &&  createRc = create new rc for _next_ version
    //      createRel && !createRc = create new full release
    //   Else
    //     !createRel && !createRc = bump dev prerelease (do nothing here)
    //     !createRel &&  createRc = create new rc for _next_ version
    //      createRel && !createRc = create new full release
    const releaseBump = hasBreakingChange ? SemVerType.MAJOR : SemVerType.MINOR;
    if (sdkVerBumpType === "rel") {
      // Special case for release bumps if the current version is an RC:
      // only promote (i.e. strip prerelease) if HEAD matches that RC's SHA.
      // If not, get the next major/minor.
      if (currentIsRel || (currentIsRc && !headMatchesTag)) {
        nextVersion = bumpOrError(releaseBump);
      } else {
        // Behavior for rc and dev is the same
        nextVersion = SemVer.copy(currentVersion);
        nextVersion.prerelease = "";
        nextVersion.build = "";
      }
      nextBumpType = "rel";
    } else if (sdkVerBumpType === "rc") {
      if (currentIsRel || currentIsRc) {
        //                   ^^^^
        // This may be slightly counter-intuitive: RC increments can
        // only be done on a release branch, so performing an RC bump
        // on a non-release branch where the HEAD itself is an RC results
        // in creating an RC for the _next_ version:
        // 1.2.0-rc1 -> 1.3.0-rc1 (not 1.2.0-rc2).
        nextVersion = bumpOrError(releaseBump);
      } else {
        // Current HEAD is a dev prerelease
        nextVersion = SemVer.copy(currentVersion);
        nextVersion.build = "";
      }
      nextVersion.prerelease = `${RC_PREFIX}01`;
      nextBumpType = "rc";
    } else if (sdkVerBumpType === "dev") {
      // TODO: decide on how best to handle hasBreakingChange in this case
      if (currentIsRel || currentIsRc) {
        nextVersion = bumpOrError(releaseBump);
        nextVersion.prerelease = `${devPrereleaseText}001`;
        nextBumpType = "dev";
      } else {
        // Keep prefix, clear postfix, zero pad to at least three digits
        nextVersion = currentVersion.nextPrerelease(undefined, "", 3);
        nextBumpType = "dev";
        if (!nextVersion) {
          // This can only happen if the current version is something
          // unexpected and invalid, like a prerelease without a number, e.g.:
          //     1.2.3-rc        1.2.3-dev        1.2.3-testing
          nextVersion = bumpOrError(SemVerType.MINOR);
          nextVersion.prerelease = `${devPrereleaseText}001`;
          core.warning(
            `Failed to bump the prerelease for version ${currentVersion.toString()}` +
              `; moving to next release version ${nextVersion.toString()}`
          );
        }
      }
    }
  }

  core.info(` - next version: ${nextVersion?.toString() ?? "none"}`);
  if (!nextVersion && !headMatchesTag) {
    fatal(`Unable to bump version for: ${currentVersion.toString()}`);
  }
  const buildMetadata = core.getInput("build-metadata");
  nextVersion = nextVersion as SemVer;
  if (buildMetadata) {
    nextVersion.build = buildMetadata;
  }

  if (nextBumpType === "dev") {
    nextVersion.prerelease += `.${shortSha(headSha)}`;
  }

  if (nextVersion && nextBumpType) {
    return {
      from: currentVersion,
      to: nextVersion,
      type: nextBumpType,
    };
  }
}

/**
 * Bump and release/tag SDK versions
 */
export async function bumpSdkVer(
  config: Configuration,
  bumpInfo: IVersionBumpTypeAndMessages,
  releaseMode: ReleaseMode,
  sdkVerBumpType: SdkVerBumpType,
  headSha: string,
  branchName: string,
  isBranchAllowedToPublish: boolean,
  createChangelog: boolean
): Promise<IVersionOutput | undefined> {
  const isReleaseBranch = new RegExp(config.releaseBranches).test(branchName);
  let hasBreakingChange = bumpInfo.processedCommits.some(
    c => c.message?.breakingChange
  );
  if (!bumpInfo.foundVersion) return; // should never happen

  // SdkVer requires a prerelease, so apply the default if not set
  config.prereleasePrefix = config.prereleasePrefix ?? "dev";

  let cv = SemVer.copy(bumpInfo.foundVersion);

  // Do not bump major version when breaking change is found in case
  // the max configured major version is already reached
  if (
    config.sdkverMaxMajor !== undefined &&
    config.sdkverMaxMajor > 0 &&
    cv.major >= config.sdkverMaxMajor
  ) {
    hasBreakingChange = false;
  }

  // Get the latest draft release matching our current version's prefix.
  // Don't look at the draft version on a release branch; the current version
  // should always reflect the version to be bumped (as no dev releases are
  // allowed on a release branch)
  const latestDraft = await getRelease({
    prefixToMatch: cv.prefix,
    draftOnly: true,
    fullReleasesOnly: false,
  });
  const latestRelease = await getRelease({
    prefixToMatch: cv.prefix,
    draftOnly: false,
    fullReleasesOnly: true,
  });

  core.info(
    `Current version: ${cv.toString()}, latest GitHub release draft: ${
      latestDraft?.name ?? "NONE"
    }, latest GitHub release: ${latestRelease?.name ?? "NONE"}`
  );

  if (!isReleaseBranch && latestDraft) {
    // If we're not on a release branch and a draft version exists that is
    // newer than the latest tag, we continue with that
    const draftVersion = SemVer.fromString(latestDraft.name);
    if (draftVersion && cv.lessThan(draftVersion)) {
      cv = draftVersion;
    }
  }
  // TODO: This is wasteful, as this info has already been available before
  const headMatchesTag = await currentHeadMatchesTag(cv.toString());
  const bump = getNextSdkVer(
    cv,
    sdkVerBumpType,
    isReleaseBranch,
    headMatchesTag,
    hasBreakingChange,
    config.prereleasePrefix ?? "dev",
    headSha,
    config.initialDevelopment
  );

  let bumped = false;
  let changelog = "";
  let releaseBranchName: string | undefined;
  let versionOutput: IVersionOutput | undefined;

  if (bump?.to) {
    versionOutput = {
      bump: {
        from: bumpInfo.foundVersion.toString(),
        to: bump.to.toString(),
        type: bump.type as ReleaseType,
      },
    };

    // Since we want the changelog since the last _full_ release, we
    // can only rely on the `bumpInfo` if the "current version" is a
    // full release. In other cases, we need to gather some information
    // to generate the proper changelog.
    const previousRelease = await getRelease({
      prefixToMatch: bump.to.prefix,
      draftOnly: false,
      fullReleasesOnly: true,
      constraint: {
        major: bump.to.major,
        minor: bump.to.minor,
      },
    });
    core.info(
      `The full release preceding the current one is ${
        previousRelease?.name ?? "undefined"
      }`
    );

    if (createChangelog) {
      if (previousRelease && cv.prerelease) {
        const toVersion =
          // Since "dev" releases on non-release-branches result in a draft
          // release, we'll need to use the commit sha.
          bump.type === "dev" ? shortSha(headSha) : bump.to.toString();

        changelog = await generateChangelogForCommits(
          previousRelease.name,
          toVersion,
          await collectChangelogCommits(previousRelease.name, config)
        );
      } else {
        changelog = await generateChangelog(bumpInfo);
      }
    }

    const { release, tag } = await publishBump(
      bump.to,
      releaseMode,
      headSha,
      changelog,
      isBranchAllowedToPublish,
      config.releaseDiscussionCategory,
      // Re-use the latest draft release only when not running on a release branch,
      // otherwise we might randomly reset a `dev-N` number chain.
      !isReleaseBranch ? latestDraft?.id : undefined
    );

    versionOutput = { ...versionOutput, tag, release };

    // If we have a release and/or a tag, we consider the bump successful
    bumped = release !== undefined || tag !== undefined;
  }

  if (!bumped) {
    core.info("ℹ️ No bump was performed");
  } else {
    // Create a release branch for releases and RC's if we're configured to do so
    // and are currently not running on a release branch.
    if (
      config.sdkverCreateReleaseBranches !== undefined &&
      !isReleaseBranch &&
      bump?.type !== "dev" &&
      bump?.to
    ) {
      releaseBranchName = `${config.sdkverCreateReleaseBranches}${bump.to.major}.${bump.to.minor}`;
      core.info(`Creating release branch ${releaseBranchName}..`);
      try {
        await createBranch(`refs/heads/${releaseBranchName}`, headSha);
      } catch (ex: unknown) {
        if (ex instanceof RequestError && ex.status === 422) {
          core.warning(
            `The branch '${releaseBranchName}' already exists` +
              `${getRunNumber() !== 1 ? " (NOTE: this is a re-run)." : "."}`
          );
        } else if (ex instanceof RequestError) {
          core.warning(
            `Unable to create release branch '${releaseBranchName}' due to ` +
              `HTTP request error (status ${ex.status}):\n${ex.message}`
          );
        } else if (ex instanceof Error) {
          core.warning(
            `Unable to create release branch '${releaseBranchName}':\n${ex.message}`
          );
        } else {
          core.warning(`Unknown error during ${releaseMode} creation`);
          throw ex;
        }
      }
    }
  }

  core.endGroup();

  return bumped || releaseMode === "none" ? versionOutput : undefined;
}

/**
 * For SdkVer, the latest tag (i.e. "current version") may not be the starting
 * point we want for generating a changelog; in this context, we want to get a
 * list of commits since the last _full_ release.
 *
 * Returns an object containing:
 *   - the name of the last full release reachable from our current version
 *   - the list of valid Conventional Commit objects since that release
 */
async function collectChangelogCommits(
  previousRelease: string,
  config: Configuration
): Promise<ConventionalCommitMessage[]> {
  core.startGroup(`📜 Gathering changelog information`);
  const commits = await getCommitsBetweenRefs(previousRelease);
  core.info(
    `Processing commit list (since ${previousRelease}) ` +
      `for changelog generation:\n-> ` +
      `${commits.map(c => c.message.split("\n")[0]).join("\n-> ")}`
  );

  const processedCommits = processCommitsForBump(commits, config);

  core.endGroup();
  return processedCommits
    .map(c => c.message)
    .filter(c => c) as ConventionalCommitMessage[];
}
