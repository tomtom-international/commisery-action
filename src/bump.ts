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

import { generateChangelog } from "./changelog";
import { Configuration } from "./config";
import {
  createRelease,
  createTag,
  currentHeadMatchesTag,
  getLatestTags,
  getRelease,
  getShaForTag,
  isPullRequestEvent,
  matchTagsToCommits,
  updateDraftRelease,
} from "./github";
import { ConventionalCommitMessage } from "./commit";
import { SemVer, SemVerType } from "./semver";
import {
  ConventionalCommitError,
  FixupCommitError,
  MergeCommitError,
} from "./errors";
import {
  ICommit,
  IValidationResult,
  IVersionBumpTypeAndMessages,
  ReleaseMode,
  SdkVerBumpType,
} from "./interfaces";
import { outputCommitListErrors, processCommits } from "./validate";

const PAGE_SIZE = 100;
const RC_PREFIX = "rc";

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
    const dbg = (tag, commit, message): void => {
      core.debug(`Tag '${tag}' on commit '${commit.slice(0, 6)}' ${message}`);
    };
    // If provided, make sure that the prefix matches as well
    const sv: SemVer | null = SemVer.fromString(tagName);
    if (sv) {
      // Asterisk is a special case, meaning 'any prefix'
      if (sv.prefix === prefix || prefix === "*") {
        dbg(tagName, commitSha, "matches prefix");
        return sv;
      }
      dbg(tagName, commitSha, "does not match prefix");
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
 * Within the current context, examine the last PAGE_SIZE commits reachable
 * from `context.sha`, as well as the last PAGE_SIZE tags in the repo.
 * Each commit shall be tried to be matched to any of the tags found.
 * The closest tag that is SemVer-compatible and matches the provided `prefix`
 * shall be returned as a SemVer object, and the highest bump type encountered
 * (breaking: major, feat: minor, fix plus `extra_patch_tags`: patch) in the commits
 * _since_ that tag shall be returned.
 *
 * @param prefix Specifies the exact prefix of the tags to be considered,
 *               '*' means "any"
 * @param targetSha The sha on which to start listing commits
 * @param config A Configuration object, which optionally contains a list of
 *               Conventional Commit type tags that, like "fix", should bump the
 *               patch version field.
 *
 * @return {IVersionBumpTypeAndMessages}
                 returns an object containing:
                 - the SemVer object or null if no (acceptable) SemVer was found.
                 - the highest bump encountered, or SemVerType.NONE if [0] is null
                 - list of ConventionalCommitMessage objects up to the found SemVer tag
 */
export async function getVersionBumpTypeAndMessages(
  prefix: string,
  targetSha: string,
  config: Configuration
): Promise<IVersionBumpTypeAndMessages> {
  const nonConventionalCommits: string[] = [];

  core.debug(`Fetching last ${PAGE_SIZE} tags from ${targetSha}..`);
  const tags = await getLatestTags(PAGE_SIZE);
  core.debug("Fetch complete");
  const tagMatcher = (commitMessage, commitSha): SemVer | null => {
    // Try and match this commit's hash to one of the tags in `tags`
    for (const tag of tags) {
      let semVer: SemVer | null = null;
      core.debug(`Considering tag ${tag.name} (${tag.commitSha}) on ${commitSha}`);
      semVer = getSemVerIfMatches(prefix, tag.name, tag.commitSha, commitSha);
      if (semVer) {
        // We've found a tag that matches to this commit. Now, we need to
        // make sure that we return the _highest_ version tag_ associated with
        // this commit
        core.debug(`Matching tag found (${tag.name}), checking other tags for commit ${commitSha}..`);
        const matchTags = tags.filter(t => t.commitSha === commitSha);
        if (matchTags.length > 1) {
          core.debug(`${matchTags.length} other tags found`);
          matchTags.sort((lhs, rhs) => SemVer.sortSemVer(lhs.name, rhs.name));
          semVer = null;
          while (semVer === null && matchTags.length !== 0) {
            const t = matchTags.pop();
            if (!t) break;
            semVer = getSemVerIfMatches(prefix, t.name, t.commitSha, commitSha);
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

  const [version, commitList] = await matchTagsToCommits(targetSha, tags, tagMatcher);

  // We'll relax certain rules while processing these commits; these are
  // commits/pull request titles that (ideally) have been validated
  // _before_ they were merged, and certain GitHub CI settings may append
  // a reference to the PR number in merge commits.
  const configCopy = JSON.parse(JSON.stringify(config));
  configCopy.rules["C014"].enabled = false; // SubjectExceedsLineLengthLimit
  configCopy.rules["C019"].enabled = false; // SubjectContainsIssueReference

  const results = processCommits(commitList, configCopy);
  const convCommits = results
    .map(r => r.message)
    .filter((r): r is ConventionalCommitMessage => r !== undefined);

  return {
    foundVersion: version,
    requiredBump: getVersionBumpType(convCommits),
    processedCommits: results,
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
  changelog,
  sha
): Promise<string | undefined> {
  const preStem = cv.prerelease
    ? `-${cv.prerelease.replace(/(.+?)\d.*/, "$1")}`
    : "";
  const baseCurrent = `${cv.prefix}${cv.major}.${cv.minor}.${cv.patch}${preStem}`;
  const nextMajor = `${cv.nextMajor().toString()}${preStem}`;
  const nextMinor = `${cv.nextMinor().toString()}${preStem}`;
  const latestDraftRelease =
    (await getRelease(nextMajor, true)) ?? (await getRelease(nextMinor, true));
  if (!latestDraftRelease) return;

  const currentDraftVersion = SemVer.fromString(latestDraftRelease.name);
  if (!currentDraftVersion) {
    core.info(`Couldn't parse ${latestDraftRelease.name} as SemVer`);
    return;
  }

  const npv = currentDraftVersion.nextPrerelease();
  if (!npv) return;

  const updateSuccess = await updateDraftRelease(
    latestDraftRelease.id,
    npv.toString(),
    npv.toString(),
    sha,
    changelog
  );
  if (!updateSuccess) {
    core.info(`Error renaming existing draft release.`);
    return;
  }
  return npv.toString();
}

async function newDraftRelease(
  currentVersion: SemVer,
  changelog: string,
  sha: string,
  prefix: string
): Promise<string> {
  // Either update went wrong or there was nothing to update
  const nextPrereleaseVersion = currentVersion.nextPatch();
  nextPrereleaseVersion.build = currentVersion.build;
  nextPrereleaseVersion.prerelease = `${prefix}1`;
  await createRelease(
    nextPrereleaseVersion.toString(),
    sha,
    changelog,
    true,
    false
  );
  return nextPrereleaseVersion.toString();
}

export async function bumpDraftRelease(
  bumpInfo: IVersionBumpTypeAndMessages,
  sha: string,
  prefix: string
): Promise<string> {
  const changelog = await generateChangelog(bumpInfo);

  if (!bumpInfo.foundVersion) throw Error("Found version is falsy"); // should never happen

  const result =
    (await tryUpdateDraftRelease(bumpInfo.foundVersion, changelog, sha)) ??
    (await newDraftRelease(bumpInfo.foundVersion, changelog, sha, prefix));

  core.info(`ℹ️ Next prerelease: ${result}`);
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
  updateDraftId?: number
): Promise<boolean> {
  // Assign Build Metadata
  const buildMetadata = core.getInput("build-metadata");
  if (buildMetadata) {
    nextVersion.build = buildMetadata;
  }

  const nv = nextVersion.toString();
  core.info(`ℹ️ Next version: ${nv}`);
  core.setOutput("next-version", nv);
  core.endGroup();
  if (releaseMode !== "none") {
    if (!isBranchAllowedToPublish) {
      return false;
    }
    if (isPullRequestEvent()) {
      core.startGroup(
        `ℹ️ Not creating ${releaseMode} on a pull request event.`
      );
      core.info(
        "We cannot create a release or tag in a pull request context, due to " +
          "potential parallelism (i.e. races) in pull request builds."
      );
      return false;
    }
    core.startGroup(`ℹ️ Creating ${releaseMode} ${nv}..`);
    try {
      if (releaseMode === "tag") {
        await createTag(nv, headSha);
      } else {
        // If version is a prerelease, but not an RC, create a draft release
        // If version is an RC, create a GitHub "pre-release"
        const isRc = nextVersion.prerelease.startsWith(RC_PREFIX);
        const isDev = nextVersion.prerelease !== "" && !isRc;
        let updated = false;
        if (updateDraftId) {
          updated = await updateDraftRelease(
            updateDraftId,
            nv,
            nv,
            headSha,
            changelog,
            isDev, // draft
            isRc // prerelease
          );
          if (!updated) {
            core.info(
              `Error renaming existing draft release, ` +
                `creating new draft release.`
            );
          }
        }
        if (!updated) {
          await createRelease(nv, headSha, changelog, isDev, isRc);
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
      return false;
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
    return false;
  }
  return true;
}

export async function bumpSemVer(
  config: Configuration,
  bumpInfo: IVersionBumpTypeAndMessages,
  releaseMode: ReleaseMode,
  branchName: string,
  headSha: string,
  isBranchAllowedToPublish: boolean
): Promise<boolean> {
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
    branchName.match(config.releaseBranches) &&
    [SemVerType.MAJOR, SemVerType.MINOR].includes(bumpInfo.requiredBump)
  ) {
    core.setFailed(
      `A ${SemVerType[bumpInfo.requiredBump]} bump is requested, but ` +
        `we can only create PATCH bumps on a release branch.`
    );
    return false;
  }

  const nextVersion = bumpInfo.foundVersion?.bump(
    bumpInfo.requiredBump,
    config.initialDevelopment
  );

  let bumped = false;
  if (nextVersion) {
    const changelog = await generateChangelog(bumpInfo);
    bumped = await publishBump(
      nextVersion,
      releaseMode,
      headSha,
      changelog,
      isBranchAllowedToPublish
    );
  } else {
    core.info("ℹ️ No bump necessary");
    core.setOutput("next-version", "");
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
      const ver = await bumpDraftRelease(
        bumpInfo,
        headSha,
        config.prereleasePrefix
      );

      core.info(`ℹ️ Created draft prerelease version ${ver}`);
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
  return bumped;
}

function getNextSdkVer(
  currentVersion: SemVer,
  sdkVerBumpType: SdkVerBumpType,
  isReleaseBranch: boolean,
  headMatchesTag: boolean,
  hasBreakingChange: boolean,
  devPrereleaseText: string,
  isInitialDevelopment: boolean
): SemVer {
  const currentIsRc = currentVersion.prerelease.startsWith(RC_PREFIX);
  const currentIsRel = currentVersion.prerelease === "";
  const currentBuildInfo = currentVersion.build;

  const die = (msg): void => {
    throw new Error(msg);
  };
  const bumpWithBuildInfo = (t: SemVerType): SemVer => {
    const v = currentVersion.bump(t, isInitialDevelopment);
    if (!v) die(`Bump ${t.toString()} for ${currentVersion} failed`);
    else v.build = currentBuildInfo;
    return v as SemVer;
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
      die(
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
      die("Breaking changes are not allowed on release branches.");
    }

    if (sdkVerBumpType === "rel") {
      if (currentIsRel) {
        // Pushes on release branches with a finalized release always
        // bump PATCH, no exception.
        nextVersion = bumpWithBuildInfo(SemVerType.PATCH);
      } else if (currentIsRc) {
        // A release bump on a release candidate results in a full release
        const nv = SemVer.copy(currentVersion);
        nv.prerelease = "";
        nextVersion = nv;
      }
    } else {
      // Bumps for "rc" and "dev" are identical on a release branch
      if (currentIsRc) {
        // Current version is an rc, so bump that
        nextVersion = currentVersion.nextPrerelease();
        if (!nextVersion) {
          die(
            `Unable to bump RC version for: ${currentVersion.toString()}; ` +
              `make sure it contains an index number.`
          );
        }
      } else {
        // Current version is a release, so bump patch
        nextVersion = bumpWithBuildInfo(SemVerType.PATCH);
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
        nextVersion = bumpWithBuildInfo(releaseBump);
      } else if (currentIsRc && headMatchesTag) {
        nextVersion = SemVer.copy(currentVersion);
        nextVersion.prerelease = "";
      } else {
        // Behavior for rc and dev is the same
        nextVersion = SemVer.copy(currentVersion);
        nextVersion.prerelease = "";
      }
    } else if (sdkVerBumpType === "rc") {
      if (currentIsRel || currentIsRc) {
        //                   ^^^^
        // This may be slightly counter-intuitive: RC increments can
        // only be done on a release branch, so performing an RC bump
        // on a non-release branch where the HEAD itself is an RC results
        // in creating an RC for the _next_ version:
        // 1.2.0-rc1 -> 1.3.0-rc1 (not 1.2.0-rc2).
        nextVersion = bumpWithBuildInfo(releaseBump);
      } else {
        // Current HEAD is a dev prerelease
        nextVersion = SemVer.copy(currentVersion);
      }
      nextVersion.prerelease = "rc1";
    } else if (sdkVerBumpType === "dev") {
      if (hasBreakingChange || currentIsRel || currentIsRc) {
        nextVersion = bumpWithBuildInfo(releaseBump);
        nextVersion.prerelease = `${devPrereleaseText}1`;
      } else {
        nextVersion = currentVersion.nextPrerelease();
        if (!nextVersion) {
          // This can only happen if the current version is something
          // unexpected and invalid, like a prerelease without a number, e.g.:
          //     1.2.3-rc        1.2.3-dev        1.2.3-testing
          nextVersion = bumpWithBuildInfo(SemVerType.MINOR);
          nextVersion.prerelease = `${devPrereleaseText}1`;
          core.warning(
            `Failed to bump the prerelease for version ${currentVersion.toString()}` +
              `; moving to next release version ${nextVersion.toString()}`
          );
        }
      }
    }
  }

  core.info(` - next version: ${nextVersion?.toString()}`);
  if (!nextVersion) {
    die(`Unable to bump version for: ${currentVersion.toString()}`);
  }

  return nextVersion as SemVer;
}

/**
 * Bump and release/tag SDK versions
 */
export async function bumpSdkVer(
  config: Configuration,
  bumpInfo: IVersionBumpTypeAndMessages,
  releaseMode,
  sdkVerBumpType: SdkVerBumpType,
  headSha,
  branchName,
  isBranchAllowedToPublish
): Promise<boolean> {
  const isReleaseBranch = branchName.match(config.releaseBranches);
  const hasBreakingChange = bumpInfo.processedCommits.some(
    c => c.message?.breakingChange
  );
  if (!bumpInfo.foundVersion) return false; // should never happen
  let cv = SemVer.copy(bumpInfo.foundVersion);
  const baseCurrent =
    `${cv.prefix}${cv.major}.${cv.minor}.${cv.patch}` +
    `${cv.prerelease ? `-${cv.prerelease.replace(/(.+?)\d.*/, "$1")}` : ""}`;

  // See if we already have a dev (draft) release for the _next_ version.
  // Don't look at the draft version on a release branch; the current version
  // should always reflect the version to be bumped (as no dev releases are
  // allowed on a release branch)

  const latestNextMinorDraft = await getRelease(
    cv.nextMinor().toString(),
    true
  );
  const latestNextMajorDraft = await getRelease(
    cv.nextMajor().toString(),
    true
  );
  const latestDraft = latestNextMajorDraft ?? latestNextMinorDraft;
  const latestRelease = await getRelease(baseCurrent, false);
  core.info(
    `Current version: ${cv.toString()}, latest GitHub release draft: ${
      latestDraft?.name ?? "NONE"
    }, latest GitHub release: ${latestRelease?.name ?? "NONE"}`
  );
  // `latestRelease` is not used for anything functional at this point

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

  const nextVersion = getNextSdkVer(
    cv,
    sdkVerBumpType,
    isReleaseBranch,
    headMatchesTag,
    hasBreakingChange,
    config.prereleasePrefix ?? "dev", // SdkVer dictates dev versions
    config.initialDevelopment
  );
  if (!nextVersion) return false; // should never happen

  let bumped = false;
  const changelog = await generateChangelog(bumpInfo);
  bumped = await publishBump(
    nextVersion,
    releaseMode,
    headSha,
    changelog,
    isBranchAllowedToPublish,
    latestDraft?.id
  );

  if (!bumped && !isReleaseBranch) {
    core.info("ℹ️ No bump was performed");
  }
  core.setOutput("next-version", nextVersion.toString());
  core.endGroup();
  return bumped;
}
