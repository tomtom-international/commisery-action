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

import { LlvmError } from "./logging";

export class ConventionalCommitError extends Error {
  errors: LlvmError[];

  constructor(message: string, errors: LlvmError[]) {
    super(message);
    this.name = "ConventionalCommitError";
    this.errors = errors;
  }
}

export class MergeCommitError extends Error {
  constructor() {
    super("Commit message describes a 'merge' commit!");
    this.name = "MergeCommitError";
  }
}

export class FixupCommitError extends Error {
  constructor() {
    super("Commit message describes a 'fixup' commit!");
    this.name = "FixupCommitError";
  }
}

export class RevertCommitError extends Error {
  constructor() {
    super("Commit message describes a 'revert' commit!");
    this.name = "RevertCommitError";
  }
}

export class BumpError extends Error {
  constructor(msg: string) {
    super(`Error while applying version bump: ${msg}`);
    this.name = "BumpError";
  }
}
