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

const core = require("@actions/core");

import { prepareEnvironment } from "./environment";
import { IS_PULLREQUEST_EVENT } from "./github";
import { getMessagesToValidate, validateMessages } from "./validate";

async function run() {
  try {
    if (!IS_PULLREQUEST_EVENT) {
      core.warning(
        "Conventional Commit Message validation requires a workflow using the `pull_request` trigger!"
      );
      return;
    }

    // Ensure that commisery is installed
    await prepareEnvironment();
    // Validate each commit against Conventional Commit standard
    const messages = await getMessagesToValidate();
    await validateMessages(messages);
  } catch (ex) {
    core.setFailed((ex as Error).message);
  }
}

run();
