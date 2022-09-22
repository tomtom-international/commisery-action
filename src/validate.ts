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

const core = require("@actions/core");

import { ConventionalCommitMessage } from "./commit";
import { Configuration } from "./config";
import { getCommits, getPullRequest, PULLREQUEST_ID } from "./github";
import { LlvmError } from "./logging";
import { ConventionalCommitError } from "./rules";

interface Message {
  title: string;
  message: string;
}

/**
 * Determines the list of messages to validate (Pull Request and/or Commits)
 */
export async function getMessagesToValidate() {
  const pullrequest_id = PULLREQUEST_ID;

  let to_validate: Message[] = [];

  // Include Pull Request title
  if (core.getBooleanInput("validate-pull-request")) {
    const pullrequest: any = await getPullRequest(pullrequest_id);
    to_validate.push({
      title: `Pull Request Title (#${pullrequest_id})`,
      message: pullrequest.title,
    });
  }

  // Include commits associated to the Pull Request
  if (core.getBooleanInput("validate-commits")) {
    let commits = await getCommits(pullrequest_id);
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
) {
  let success = true;

  for (const item of messages) {
    core.startGroup(`🔍 Checking ${item.title}`);
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
      }
    }

    if (errors.length > 0) {
      for (var error of errors) {
        console.log(error.report());
      }
      core.startGroup(`❌ ${item.title}: ${item.message}`);
      for (var error of errors) {
        core.error(error.message, { title: `(${item.title}) ${item.message}` });
      }
      success = false;

      core.endGroup();
    }
    core.endGroup();
  }

  if (!success) {
    core.setFailed(
      `Your Pull Request is not compliant to Conventional Commits`
    );
  } else {
    console.log(
      "✅ Your Pull Request complies to the conventional commit standard!"
    );
  }
}
