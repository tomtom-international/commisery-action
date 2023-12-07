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
import {
  getCommitsInPR,
  getPullRequestId,
  getPullRequestTitle,
} from "./github";
import { LlvmError } from "./logging";
import { SemVerType } from "./semver";
import { ICommit, IValidationResult } from "./interfaces";
import {
  ConventionalCommitError,
  FixupCommitError,
  MergeCommitError,
} from "./errors";

interface ValidationResult {
  compliant: boolean;
  messages: ConventionalCommitMessage[];
}

/**
/* Takes a single non-compliant commit `message`, its `sha`, and its list of
 * `errors`, and outputs them to `core.error` if the parameter `useErrorLevel`
 * is `true`, or `core.warning` otherwise.
 * If `sha` is `undefined`, the message is assumed to be a pull request title
 * and the output will reflect that.
 */
function outputCommitErrors(
  message: string,
  errors: LlvmError[],
  sha: string | undefined,
  useErrorLevel: boolean
): void {
  const isPullRequestTitle = sha === undefined;
  if (isPullRequestTitle) {
    core.startGroup(`❌ Pull request title`);
    core.info(
      "⚠️ A pull request's title is the default value for a generated merge commit. " +
        "It should therefore adhere to the Conventional Commits specification as well.\n" +
        "This check can be disabled by defining the `validate-pull-request` and `validate-pull-request-title-bump` " +
        "action parameters as `false` in the workflow file.\n"
    );
  } else {
    const subject = (message.match(/^.*$/m) ?? [""])[0];
    core.startGroup(`❌ Commit (${sha.slice(0, 8)}): ${subject}`);
  }
  for (const error of errors) {
    if (error.message === undefined) {
      continue;
    }
    const outputFunc = useErrorLevel ? core.error : core.warning;
    outputFunc(error.message, {
      title: isPullRequestTitle
        ? `(PR title) ${message}`
        : `(Commit ${sha.slice(0, 8)}) ${message}`,
    });
    const indicatorMaybe = error.indicator();
    if (indicatorMaybe) {
      core.info(indicatorMaybe);
    }
  }
  core.endGroup();
}

/**
 * Takes an array of IValidationResult objects and outputs the errors
 * contained therein.
 * When `useErrorLevel` is set to `true`, the commit errors are printed
 * the on error level (when `false`, the warning level).
 */
export function outputCommitListErrors(
  validationResults: IValidationResult[],
  useErrorLevel: boolean
): void {
  for (const c of validationResults) {
    if (c.errors.length > 0) {
      outputCommitErrors(c.input.message, c.errors, c.input.sha, useErrorLevel);
    }
  }
}

/* Takes an array of ICommit interface objects and process them using the
 * provided `Configuration` into an array of IValidationResult objects.
 * This contains the input, ConventionalCommitMessage object if compliant,
 * and any errors relating to the message if not.
 */
export function processCommits(
  commits: ICommit[],
  config: Configuration
): IValidationResult[] {
  const results: IValidationResult[] = [];
  for (const commit of commits) {
    const message = commit.message;

    try {
      const cc = new ConventionalCommitMessage(message, undefined, config);
      results.push({ input: commit, message: cc, errors: [] });
    } catch (error: unknown) {
      if (error instanceof ConventionalCommitError) {
        results.push({
          input: commit,
          message: undefined,
          errors: error.errors,
        });
        continue;
      } else if (
        error instanceof MergeCommitError ||
        error instanceof FixupCommitError
      ) {
        continue;
      }

      throw error;
    }
  }
  return results;
}

/**
 * Validates all commit messages in the current pull request.
 */
export async function validateCommitsInCurrentPR(
  config: Configuration
): Promise<ValidationResult> {
  const commits: ICommit[] = await getCommitsInPR(getPullRequestId());
  const results: IValidationResult[] = processCommits(commits, config);

  const passResults = results.filter(c => c.errors.length === 0);
  const failResults = results.filter(c => c.errors.length !== 0);

  if (passResults.length > 0) {
    core.info(
      `✅ ${failResults.length === 0 ? "All " : ""}${passResults.length}` +
        ` of the pull request's commits are valid Conventional Commits`
    );
    for (const c of passResults) {
      core.startGroup(
        `✅ Commit (${c.input.sha.slice(0, 8)}): ${c.message?.subject}`
      );
      core.info(c.input.message);
      core.endGroup();
    }
  }
  if (failResults.length > 0) {
    core.info(""); // for vertical whitespace
    core.setFailed(
      `${failResults.length} of the pull request's commits are not valid Conventional Commits`
    );

    outputCommitListErrors(failResults, true);
  }

  return {
    compliant: failResults.length === 0,
    messages: passResults.map(r => r.message as ConventionalCommitMessage),
  };
}

/**
 * Validates the pull request title and, if compliant, returns it as a
 * ConventionalCommitMessage object.
 */
export async function validatePrTitle(
  _: Configuration
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
  } catch (error: unknown) {
    if (error instanceof ConventionalCommitError) {
      errors = error.errors;
    } else if (
      error instanceof MergeCommitError ||
      error instanceof FixupCommitError
    ) {
      errorMessage = `${errorMessage} (it describes a ${
        error instanceof MergeCommitError ? "merge" : "fixup"
      } commit)`;
      core.setFailed(errorMessage);
      return undefined;
    } else {
      throw error;
    }
  }
  if (errors.length > 0) {
    core.setFailed(errorMessage);
    outputCommitErrors(prTitleText, errors, undefined, true);
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
  const commits = await getCommitsInPR(getPullRequestId());
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

  const results = processCommits(commits, config);

  if (results.some(c => c.errors.length !== 0)) {
    // Abort if the list contains any non-compliant commits; bump level
    // validation only really makes sense if all commits are found to
    // be compliant.
    core.warning(`${baseError}, as the PR contains non-compliant commits`);
    return false;
  }

  const highestBump: SemVerType =
    results.reduce((acc, val) => {
      const accb = acc.message?.bump ?? SemVerType.NONE;
      const valb = val.message?.bump ?? SemVerType.NONE;
      return accb > valb ? acc : val;
    }).message?.bump ?? SemVerType.NONE;

  if (highestBump !== prTitle.bump) {
    const commitSubjects = results
      .map(r => r.message?.subject)
      .filter(x => x !== undefined);

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
