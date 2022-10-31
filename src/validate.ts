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

interface Message {
  title: string;
  message: string;
}

/**
 * Determines the list of messages to validate (Pull Request and/or Commits)
 */
export async function getMessagesToValidate(): Promise<Message[]> {
  const pullrequest_id = getPullRequestId();

  const to_validate: Message[] = [];

  // Include Pull Request title
  if (core.getBooleanInput("validate-pull-request")) {
    to_validate.push({
      title: `Pull Request Title (#${pullrequest_id})`,
      message: await getPullRequestTitle(),
    });
  }

  // Include commits associated to the Pull Request
  if (core.getBooleanInput("validate-commits")) {
    const commits = await getCommits(pullrequest_id);
    for (const commit of commits) {
      to_validate.push({
        title: `Commit SHA (${commit.sha})`,
        message: commit.commit.message,
      });
    }
  }

  return to_validate;
}

/**
 * Validates all specified messages
 */
export async function validateMessages(
  messages: Message[],
  config: Configuration
): Promise<void> {
  let success = true;

  for (const item of messages) {
    let errors: LlvmError[] = [];
    try {
      const commit = new ConventionalCommitMessage(
        item.message,
        undefined,
        config
      );
    } catch (error) {
      if (error instanceof ConventionalCommitError) {
        errors = error.errors;
      } else if (
        error instanceof MergeCommitError ||
        error instanceof FixupCommitError
      ) {
        continue;
      }
    }

    if (errors.length > 0) {
      core.startGroup(`❌ ${item.title}: ${item.message}`);
      for (const error of errors) {
        core.info(error.report());
      }

      for (const error of errors) {
        if (error.message !== undefined) {
          core.error(error.message, {
            title: `(${item.title}) ${item.message}`,
          });
        }
      }
      success = false;
      core.endGroup();
    } else {
      core.info(`✅ ${item.title}`);
    }
  }

  if (!success) {
    core.setFailed(
      `Your Pull Request is not compliant with the Conventional Commits specification`
    );
  } else {
    core.info(
      "✅ Your Pull Request complies with the Conventional Commits specification!"
    );
  }
}

/**
 * Validates bump level consistency between the PR title and its commits
 */
export async function validatePrTitleBump(
  config: Configuration
): Promise<void> {
  const prTitleText = await getPullRequestTitle();
  const commits: string[] = (await getCommits(getPullRequestId())).map(m => {
    return m.commit.message;
  });
  let highestBump: SemVerType = SemVerType.NONE;
  const prTitle = (() => {
    try {
      return new ConventionalCommitMessage(prTitleText);
    } catch (error) {
      throw new Error(
        `The PR title does not conform to the Conventional Commits specification.`
      );
    }
  })();

  for (const commit of commits) {
    try {
      const cc = new ConventionalCommitMessage(commit);
      highestBump = cc.bump > highestBump ? cc.bump : highestBump;
    } catch (error) {
      if (
        // We'll just ignore non-compliant commits
        !(
          error instanceof ConventionalCommitError ||
          error instanceof MergeCommitError ||
          error instanceof FixupCommitError
        )
      ) {
        throw error;
      }
    }
  }

  if (highestBump !== prTitle.bump) {
    const messageList = ` - ${commits.join("\n - ")}`;

    core.setFailed(
      `The PR title's bump level is not consistent with its commits.`
    );

    core.error(`The PR title represents bump level ${
      SemVerType[prTitle.bump]
    }, while the highest bump in the commits is ${SemVerType[highestBump]}.
PR title: "${prTitleText}"
Commit list:
${messageList}`);
  } else {
    core.info(
      `✅ Pull request title bump level is consistent with its commits`
    );
  }
}
