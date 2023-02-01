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

import { ConventionalCommitMessage } from "./commit";
import { Configuration } from "./config";
import { getCommits, getPullRequestId, getPullRequestTitle } from "./github";
import { LlvmError } from "./logging";
import { SemVerType } from "./semver";
import {
  ConventionalCommitError,
  FixupCommitError,
  MergeCommitError,
} from "./errors";

interface ValidationResult {
  compliant: boolean;
  messages: ConventionalCommitMessage[];
}

function outputErrors(
  message: string,
  errors: LlvmError[],
  sha: string | undefined
): void {
  const isPrTitle = sha === undefined;

  if (isPrTitle) {
    core.startGroup(`❌ Pull request title`);
    core.info(
      "⚠️ A pull request's title is the default value for a generated merge commit. " +
        "It should therefore adhere to the Conventional Commits specification as well.\n" +
        "This check can be disabled by defining the `validate-pull-request` and `validate-pull-request-title-bump` " +
        "action parameters as `false` in the workflow file.\n"
    );
  } else {
    core.startGroup(`❌ Commit (${sha})`);
  }
  for (const error of errors) {
    if (error.message === undefined) {
      continue;
    }
    core.error(error.message, {
      title: isPrTitle ? `(PR title) ${message}` : `(Commit ${sha}) ${message}`,
    });
    const indicatorMaybe = error.indicator();
    if (indicatorMaybe) {
      core.info(indicatorMaybe);
    }
  }
  core.endGroup();
}

/**
 * Validates all commit messages in the current pull request.
 */
export async function validateCommitMessages(
  config: Configuration
): Promise<ValidationResult> {
  const conventionalCommitMessages: ConventionalCommitMessage[] = [];
  interface CommitResults {
    message: string;
    sha: string;
    errors: LlvmError[];
  }

  const results: CommitResults[] = [];

  const commits = await getCommits(getPullRequestId());
  for (const commit of commits) {
    const message = commit.commit.message;
    const sha = commit.sha;

    try {
      conventionalCommitMessages.push(
        new ConventionalCommitMessage(message, undefined, config)
      );
      results.push({ message, sha, errors: [] });
    } catch (error) {
      if (error instanceof ConventionalCommitError) {
        results.push({ message, sha, errors: error.errors });
      } else if (
        error instanceof MergeCommitError ||
        error instanceof FixupCommitError
      ) {
        continue;
      }
    }
  }

  const goodCommits = results.filter(c => {
    return c.errors.length === 0;
  });
  const badCommits = results.filter(c => {
    return c.errors.length !== 0;
  });

  if (goodCommits.length > 0) {
    core.info(
      `✅ ${badCommits.length === 0 ? "All " : ""}${goodCommits.length}` +
        ` of the pull request's commits are valid Conventional Commits`
    );
    for (const c of goodCommits) {
      core.startGroup(`✅ Commit (${c.sha})`);
      core.info(c.message);
      core.endGroup();
    }
  }
  if (badCommits.length > 0) {
    core.info(""); // for vertical whitespace
    core.setFailed(
      `${badCommits.length} of the pull request's commits are not valid Conventional Commits`
    );
    for (const c of badCommits) {
      outputErrors(c.message, c.errors, c.sha);
    }
  }

  return {
    compliant: badCommits.length === 0,
    messages: conventionalCommitMessages,
  };
}

/**
 * Validates the pull request title and, if compliant, returns it as a
 * ConventionalCommitMessage object.
 */
export async function validatePrTitle(
  config: Configuration
): Promise<ConventionalCommitMessage | undefined> {
  const prTitleText = await getPullRequestTitle();
  let errors: LlvmError[] = [];
  let conventionalCommitMessage: ConventionalCommitMessage | undefined;

  core.info(""); // for vertical whitespace
  let errorMessage =
    "The pull request title is not compliant " +
    "with the Conventional Commits specification";
  try {
    conventionalCommitMessage = new ConventionalCommitMessage(prTitleText);
  } catch (error) {
    if (error instanceof ConventionalCommitError) {
      errors = error.errors;
    } else {
      if (error instanceof MergeCommitError) {
        errorMessage = `${errorMessage} (it describes a merge commit)`;
      } else if (error instanceof FixupCommitError) {
        errorMessage = `${errorMessage} (it describes a fixup commit)`;
      }
      core.setFailed(errorMessage);
      return undefined;
    }
  }
  if (errors.length > 0) {
    core.setFailed(errorMessage);
    outputErrors(prTitleText, errors, undefined);
  } else {
    core.startGroup(
      `✅ The pull request title is compliant with the Conventional Commits specification`
    );
    core.info(prTitleText);
    core.endGroup();
  }
  return conventionalCommitMessage;
}

/**
 * Validates bump level consistency between the PR title and its commits.
 * This implies that the PR title must comply with the Conventional Commits spec.
 */
export async function validatePrTitleBump(
  config: Configuration
): Promise<boolean> {
  const prTitleText = await getPullRequestTitle();
  const commits: string[] = (await getCommits(getPullRequestId())).map(m => {
    return m.commit.message;
  });
  let highestBump: SemVerType = SemVerType.NONE;
  const prTitle = await validatePrTitle(config);
  const baseError =
    "Cannot validate the consistency of bump levels between PR title and PR commits";

  if (prTitle === undefined) {
    core.warning(
      `${baseError}, as PR title is not a valid Conventional Commits message.`
    );
    return false;
  }

  if (commits.length === 0) {
    core.warning("No commits found in this pull request.");
    return true;
  }

  core.info(""); // for vertical whitespace

  for (const commit of commits) {
    try {
      const cc = new ConventionalCommitMessage(commit);
      highestBump = cc.bump > highestBump ? cc.bump : highestBump;
    } catch (error) {
      if (
        !(
          error instanceof ConventionalCommitError ||
          error instanceof MergeCommitError ||
          error instanceof FixupCommitError
        )
      ) {
        throw error;
      }
      core.warning(`${baseError}, as the PR contains non-compliant commits`);
      return false;
    }
  }

  if (highestBump !== prTitle.bump) {
    const commitSubjects = commits.map(m => {
      return m.split("\n")[0];
    });

    core.setFailed(
      "The PR title's bump level is not consistent with its commits.\n" +
        `The PR title type ${prTitle.type} represents bump level ` +
        `${SemVerType[prTitle.bump]}, while the highest bump in the ` +
        `commits is ${SemVerType[highestBump]}.\n` +
        `PR title: "${prTitleText}"\n` +
        `Commit list:\n${` - ${commitSubjects.join("\n - ")}`}`
    );

    return false;
  } else {
    core.info(
      `✅ The pull request title's bump level is consistent with the PR's commits`
    );
    return true;
  }
}
