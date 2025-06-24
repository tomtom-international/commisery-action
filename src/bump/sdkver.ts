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
import { RequestError } from "@octokit/request-error";

import { generateChangelogForCommits, generateChangelog } from "../changelog";
import { Configuration } from "../config";
import { createBranch, currentHeadMatchesTag, getCommitsBetweenRefs, getRunNumber, getRelease } from "../github";
import { ConventionalCommitMessage } from "../commit";
import { SemVer } from "../semver";
import { BumpError } from "../errors";
import * as interfaces from "../interfaces";
import { processCommitsForBump, publishBump, RC_PREFIX, shortSha } from "./bump";

interface VersionUpdateParams {
  currentVersion: SemVer;
  currentType: interfaces.SdkVerBumpType;
  bumpType: interfaces.SdkVerBumpType;
  isReleaseBranch: boolean;
  headMatchesTag: boolean;
  hasBreakingChange: boolean;
  devPrereleaseText: string;
  headSha: string;
  isInitialDevelopment: boolean;
}

interface VersionUpdateCase {
  currentType: interfaces.SdkVerBumpType;
  bumpType: interfaces.SdkVerBumpType;
  isReleaseBranch: boolean;
  updater: (params: VersionUpdateParams) => interfaces.IBumpInfo | undefined;
}

// prettier-ignore
const versionUpdateCases: VersionUpdateCase[] = [
  // Main branch, current development version
  { currentType: "dev", bumpType: "dev", isReleaseBranch: false, updater: (params) => { return updateDevelopmentVersion(params); } },
  { currentType: "dev", bumpType: "rc" , isReleaseBranch: false, updater: (params) => { return promoteToReleaseCandidateVersion(params); } },
  { currentType: "dev", bumpType: "rel", isReleaseBranch: false, updater: (params) => { return promoteToReleaseVersion(params); } },
  
  // Main branch, current release candidate version
  { currentType: "rc" , bumpType: "dev", isReleaseBranch: false, updater: (params) => { return newDevelopmentVersion(params); } },
  { currentType: "rc" , bumpType: "rc" , isReleaseBranch: false, updater: (params) => { return newReleaseCandidateVersion(params); } },
  { currentType: "rc" , bumpType: "rel", isReleaseBranch: false, updater: (params) => { return promoteToReleaseVersion(params); } },
  
  // Main branch, current release version
  { currentType: "rel", bumpType: "dev", isReleaseBranch: false, updater: (params) => { return newDevelopmentVersion(params); } },
  { currentType: "rel", bumpType: "rc" , isReleaseBranch: false, updater: (params) => { return newReleaseCandidateVersion(params); } },
  { currentType: "rel", bumpType: "rel", isReleaseBranch: false, updater: (params) => { return newReleaseVersion(params); } },
  
  // Release branch, current development version - this is not allowed and will throw an error
  // { currentType: "dev" ...}

  // Release branch, current release candidate version
  { currentType: "rc" , bumpType: "dev", isReleaseBranch: true, updater: (params) => { return updateReleaseCandidateVersion(params); } },
  { currentType: "rc" , bumpType: "rc" , isReleaseBranch: true, updater: (params) => { return updateReleaseCandidateVersion(params); } },
  { currentType: "rc" , bumpType: "rel", isReleaseBranch: true, updater: (params) => { return promoteToReleaseVersion(params); } },

  // Release branch, current release version
  { currentType: "rel", bumpType: "dev", isReleaseBranch: true, updater: (params) => { return updateReleaseVersion(params); } },
  { currentType: "rel", bumpType: "rc" , isReleaseBranch: true, updater: (params) => { return updateReleaseVersion(params); } },
  { currentType: "rel", bumpType: "rel", isReleaseBranch: true, updater: (params) => { return updateReleaseVersion(params); } },
];

/**
 * Increments a development version, i.e. 1.0.0-dev001.SHA -> 1.0.0-dev002.SHA
 *
 * Exceptions:
 * - A new development version is created when the previous version is not using a SdkVer compatible prerelease pattern.
 */
function updateDevelopmentVersion(params: VersionUpdateParams): interfaces.IBumpInfo {
  let nextVersion = params.currentVersion.nextPrerelease(undefined, "", 3);
  if (!nextVersion) return newDevelopmentVersion(params);

  nextVersion.prerelease = `${nextVersion.prerelease}.${shortSha(params.headSha)}`;
  return { from: params.currentVersion, to: nextVersion, type: "dev" };
}

/**
 * Increments a release candidate version, i.e. 1.0.0-rc01 -> 1.0.0-rc02
 *
 * Exceptions:
 * - No release candidate version is created when the head matches a tag.
 * - Release candidates can only be updated on a release branch.
 * - Breaking changes are not allowed when updating a release candidate version.
 * - A new release candidate will not be created when the previous version is not using a SdkVer compatible prerelease pattern.
 */
function updateReleaseCandidateVersion(params: VersionUpdateParams): interfaces.IBumpInfo {
  if (params.headMatchesTag)
    throw new BumpError("Do now update release candidate version when the head matches a tag.");
  if (!params.isReleaseBranch) throw new BumpError("Cannot update release candidate version on a non-release branch.");
  if (params.hasBreakingChange) throw new BumpError("Cannot update release candidates with a breaking change.");

  let nextVersion = params.currentVersion.nextPrerelease(undefined, "", 2);
  if (!nextVersion)
    throw new BumpError(`Failed to determine next prerelease version from ${params.currentVersion.toString()}`);

  return { from: params.currentVersion, to: nextVersion, type: "rc" };
}

/**
 * Updates a release version, i.e. 1.0.0 -> 1.0.1
 *
 * Exceptions:
 * - No release version is created when the head matches a tag.
 * - Release versions can only be updated on a release branch.
 * - Breaking changes are not allowed when updating a release version.
 */
function updateReleaseVersion(params: VersionUpdateParams): interfaces.IBumpInfo {
  if (params.headMatchesTag) throw new BumpError("Cannot update release version when the head matches a tag.");
  if (!params.isReleaseBranch) throw new BumpError("Cannot update release version on a non-release branch.");
  if (params.hasBreakingChange) throw new BumpError("Cannot update release version with breaking change.");

  return { from: params.currentVersion, to: params.currentVersion.nextPatch(), type: "rel" };
}

/**
 * Creates a new development version, i.e.
 *   Non-breaking: 1.0.0-rc01 --> 1.1.0-dev001.SHA
 *   Breaking: 1.0.0-rc01 --> 2.0.0-dev001.SHA
 *
 * Exceptions:
 * - New development versions can only be created on a main branch.
 */
function newDevelopmentVersion(params: VersionUpdateParams): interfaces.IBumpInfo {
  if (params.isReleaseBranch) throw new BumpError("Cannot create a new development version on a release branch.");

  let nextVersion = SemVer.copy(params.currentVersion);
  nextVersion = params.hasBreakingChange ? nextVersion.nextMajor(params.isInitialDevelopment) : nextVersion.nextMinor();
  nextVersion.prerelease = `dev001.${shortSha(params.headSha)}`;

  return { from: params.currentVersion, to: nextVersion, type: "dev" };
}

/**
 * Creates a new Release Candidate version, i.e.
 *   Non-breaking: 1.0.0-dev001.SHA --> 1.0.0-rc01
 *   Breaking: 1.0.0-dev001.SHA --> 2.0.0-rc01
 *
 * Exceptions:
 * - New Release Candidate versions can only be created on a main branch.
 */
function newReleaseCandidateVersion(params: VersionUpdateParams): interfaces.IBumpInfo {
  if (params.isReleaseBranch) throw new BumpError("Cannot create a new release candidate version on a release branch.");

  let nextVersion = SemVer.copy(params.currentVersion);
  nextVersion = params.hasBreakingChange ? nextVersion.nextMajor(params.isInitialDevelopment) : nextVersion.nextMinor();
  nextVersion.prerelease = `rc01`;

  return { from: params.currentVersion, to: nextVersion, type: "rc" };
}

/**
 * Creates a new release version, i.e.
 *   Non-breaking: 1.0.0 --> 1.1.0
 *   Breaking: 1.0.0 --> 2.0.0
 */
function newReleaseVersion(params: VersionUpdateParams): interfaces.IBumpInfo {
  let nextVersion = params.hasBreakingChange
    ? params.currentVersion.nextMajor(params.isInitialDevelopment)
    : params.currentVersion.nextMinor();
  return { from: params.currentVersion, to: nextVersion, type: "rel" };
}

/**
 * Promotes a development version to a Release Candidate version, i.e.
 *   Non-breaking: 1.0.0-dev001.SHA -> 1.0.0-rc01
 *   Breaking: 1.0.0-dev001.SHA -> 2.0.0-rc01
 */
function promoteToReleaseCandidateVersion(params: VersionUpdateParams): interfaces.IBumpInfo {
  let nextVersion: SemVer | null = params.hasBreakingChange
    ? params.currentVersion.nextMajor()
    : SemVer.copy(params.currentVersion);
  nextVersion.prerelease = `${RC_PREFIX}01`;
  nextVersion.build = "";

  return { from: params.currentVersion, to: nextVersion, type: "rc" };
}

/**
 * Promotes a development- or release candidate- version to a release version, i.e.
 *   Non-breaking: 1.0.0-dev001.SHA -> 1.0.0
 *   Breaking: 1.0.0-dev001.SHA -> 2.0.0
 *
 * Exceptions:
 *   - Cannot apply a breaking change on a release branch.
 *
 * NOTE: This function can be called from both main and release branches for release candidates.
 */
function promoteToReleaseVersion(params: VersionUpdateParams): interfaces.IBumpInfo {
  if (params.hasBreakingChange) {
    if (params.isReleaseBranch) throw new BumpError("Cannot promote to release version with breaking change.");
    return newReleaseVersion(params);
  }

  let nextVersion: SemVer | null = SemVer.copy(params.currentVersion);
  nextVersion.prerelease = "";
  nextVersion.build = "";

  return { from: params.currentVersion, to: nextVersion, type: "rel" };
}

/**
 * Finds the version update case that matches the provided parameters.
 */
function findVersionUpdateCase(params: VersionUpdateParams): VersionUpdateCase | undefined {
  return versionUpdateCases.find(
    c =>
      c.currentType === params.currentType &&
      c.bumpType === params.bumpType &&
      c.isReleaseBranch === params.isReleaseBranch
  );
}

/**
 * Determines the next SDK version based on the current version and the bump type.
 * @throws BumpError if no matching version update case is found.
 */
function getNextSdkVer(
  currentVersion: SemVer,
  sdkVerBumpType: interfaces.SdkVerBumpType,
  isReleaseBranch: boolean,
  headMatchesTag: boolean,
  hasBreakingChange: boolean,
  devPrereleaseText: string,
  headSha: string,
  isInitialDevelopment: boolean
): interfaces.IBumpInfo | undefined {
  let currentReleaseType: interfaces.SdkVerBumpType;
  if (currentVersion.prerelease.startsWith(RC_PREFIX)) {
    currentReleaseType = "rc";
  } else if (currentVersion.prerelease === "") {
    currentReleaseType = "rel";
  } else {
    currentReleaseType = "dev";
  }

  core.info(`Determining SDK bump for version ${currentVersion.toString()}:`);
  core.info(` - current version type: ${currentReleaseType}`);
  core.info(` - bump type: ${sdkVerBumpType}`);
  core.info(` - branch type: ${isReleaseBranch ? "" : "not "}release`);
  core.info(` - breaking changes: ${hasBreakingChange ? "yes" : "no"}`);

  const params: VersionUpdateParams = {
    currentVersion,
    currentType: currentReleaseType,
    bumpType: sdkVerBumpType,
    isReleaseBranch,
    headMatchesTag,
    hasBreakingChange,
    devPrereleaseText,
    headSha,
    isInitialDevelopment,
  };

  const match = findVersionUpdateCase(params);
  if (match) {
    return match.updater(params);
  }

  throw new BumpError(
    `No version update case found for bump type '${sdkVerBumpType}' ` +
      `on release branch '${isReleaseBranch}', ` +
      `head matches tag: ${headMatchesTag}, ` +
      `has breaking change: ${hasBreakingChange}, ` +
      `initial development: ${isInitialDevelopment}`
  );
}

/**
 * Bump and release/tag SDK versions
 */
export async function bumpSdkVer(
  config: Configuration,
  bumpInfo: interfaces.IVersionBumpTypeAndMessages,
  releaseMode: interfaces.ReleaseMode,
  sdkVerBumpType: interfaces.SdkVerBumpType,
  headSha: string,
  branchName: string,
  isBranchAllowedToPublish: boolean,
  createChangelog: boolean
): Promise<interfaces.IVersionOutput | undefined> {
  const isReleaseBranch = new RegExp(config.releaseBranches).test(branchName);
  let hasBreakingChange = bumpInfo.processedCommits.some(c => c.message?.breakingChange);
  if (!bumpInfo.foundVersion) return; // should never happen

  // SdkVer requires a prerelease, so apply the default if not set
  config.prereleasePrefix = config.prereleasePrefix ?? "dev";

  let cv = SemVer.copy(bumpInfo.foundVersion);

  // Do not bump major version when breaking change is found in case
  // the max configured major version is already reached
  if (config.sdkverMaxMajor !== undefined && config.sdkverMaxMajor > 0 && cv.major >= config.sdkverMaxMajor) {
    console.log(`Maximum major version ${config.sdkverMaxMajor} reached, not bumping major version.`);
    hasBreakingChange = false;
  }

  // Get the latest draft release matching our current version's prefix.
  // Don't look at the draft version on a release branch; the current version
  // should always reflect the version to be bumped (as no dev releases are
  // allowed on a release branch)
  const latestDraft = await getRelease({ prefixToMatch: cv.prefix, draftOnly: true, fullReleasesOnly: false });
  const latestRelease = await getRelease({ prefixToMatch: cv.prefix, draftOnly: false, fullReleasesOnly: true });

  core.info(
    `Current version: ${cv.toString()}, latest GitHub release draft: ${latestDraft?.name ?? "NONE"}, latest GitHub release: ${latestRelease?.name ?? "NONE"}`
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
  let versionOutput: interfaces.IVersionOutput | undefined;

  if (bump?.to) {
    // Since we want the changelog since the last _full_ release, we can only rely on the `bumpInfo` if the "current version" is a
    // full release. In other cases, we need to gather some information to generate the proper changelog.
    const previousRelease = await getRelease({
      prefixToMatch: bump.to.prefix,
      draftOnly: false,
      fullReleasesOnly: true,
      constraint: { major: bump.to.major, minor: bump.to.minor },
    });
    core.info(`The full release preceding the current one is ${previousRelease?.name ?? "undefined"}`);

    if (createChangelog) {
      if (previousRelease && cv.prerelease) {
        // Since "dev" releases on non-release-branches result in a draft release, we'll need to use the commit sha.
        const toVersion = bump.type === "dev" ? shortSha(headSha) : bump.to.toString();

        const changelogCommits = await collectChangelogCommits(previousRelease.name, config);
        changelog = await generateChangelogForCommits(previousRelease.name, toVersion, changelogCommits);
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
      // Re-use the latest draft release only when not running on a release branch, otherwise we might randomly reset a `dev-N` number chain.
      !isReleaseBranch ? latestDraft?.id : undefined
    );

    versionOutput = {
      tag,
      release,
      bump: {
        from: bumpInfo.foundVersion.toString(),
        to: bump.to.toString(),
        type: bump.type as interfaces.ReleaseType,
      },
    };

    // If we have a release and/or a tag, we consider the bump successful
    bumped = release !== undefined || tag !== undefined;
  }

  if (!bumped) {
    core.info("ℹ️ No bump was performed");
  } else {
    // Create a release branch for releases and RC's if we're configured to do so and are currently not running on a release branch.
    if (config.sdkverCreateReleaseBranches !== undefined && !isReleaseBranch && bump?.type !== "dev" && bump?.to) {
      releaseBranchName = `${config.sdkverCreateReleaseBranches}${bump.to.major}.${bump.to.minor}`;
      core.info(`Creating release branch ${releaseBranchName}..`);
      try {
        await createBranch(`refs/heads/${releaseBranchName}`, headSha);
      } catch (ex: unknown) {
        if (ex instanceof RequestError && ex.status === 422) {
          core.warning(
            `The branch '${releaseBranchName}' already exists ${getRunNumber() !== 1 ? " (NOTE: this is a re-run)." : "."}`
          );
        } else if (ex instanceof RequestError) {
          core.warning(
            `Unable to create release branch '${releaseBranchName}' due to HTTP request error (status ${ex.status}):\n${ex.message}`
          );
        } else if (ex instanceof Error) {
          core.warning(`Unable to create release branch '${releaseBranchName}':\n${ex.message}`);
        } else {
          core.warning(`Unknown error during ${releaseMode} creation`);
          throw ex;
        }
      }
    }
  }

  core.endGroup();

  return bumped ? versionOutput : undefined;
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
    `Processing commit list (since ${previousRelease}) for changelog generation:\n-> ` +
      `${commits.map(c => c.message.split("\n")[0]).join("\n-> ")}`
  );

  const processedCommits = processCommitsForBump(commits, config);
  core.endGroup();

  return processedCommits.map(c => c.message).filter(c => c) as ConventionalCommitMessage[];
}
