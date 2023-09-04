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
import { getVersionBumpType } from "../bump";
import { ConventionalCommitMessage } from "../commit";

import { Configuration } from "../config";
import { getConfig, isPullRequestEvent, updateLabels } from "../github";
import * as Label from "../label";
import { SemVerType } from "../semver";
import { validateCommitsInCurrentPR, validatePrTitle, validatePrTitleBump } from "../validate";

/**
 * Determine labels to add based on the provided conventional commits
 */
async function determineLabels(
  conventionalCommits: ConventionalCommitMessage[],
  config: Configuration
): Promise<string[]> {
  const highestBumpType = getVersionBumpType(conventionalCommits);

  if (highestBumpType === SemVerType.NONE) {
    return [];
  }

  const labels: string[] = [];
  if (config.initialDevelopment) {
    labels.push(Label.create("initial development"));
  }

  labels.push(Label.create("bump", SemVerType[highestBumpType]));

  return labels;
}

async function run(): Promise<void> {
  try {
    if (!isPullRequestEvent()) {
      core.warning("Conventional Commit Message validation requires a workflow using the `pull_request` trigger!");
      return;
    }
    await getConfig(core.getInput("config"));
    const config = new Configuration(".commisery.yml");
    let compliant = true;

    if (core.getBooleanInput("validate-commits")) {
      // Validate the current PR's commit messages
      const result = await validateCommitsInCurrentPR(config);
      compliant &&= result.compliant;
      await updateLabels(await determineLabels(result.messages, config));
    }

    if (core.getBooleanInput("validate-pull-request-title-bump")) {
      const ok = await validatePrTitleBump(config);
      compliant &&= ok;

      // Validating the PR title bump level implies validating the title itself
    } else if (core.getBooleanInput("validate-pull-request")) {
      const ok = (await validatePrTitle(config)) !== undefined;
      compliant &&= ok;
    }

    core.info(""); // add vertical whitespace

    if (compliant) {
      core.info("✅ The pull request passed all configured checks");
    }
  } catch (ex) {
    core.setFailed((ex as Error).message);
  }
}

run();

export const exportedForTesting = {
  run,
};
