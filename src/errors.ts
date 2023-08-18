/*
 * SPDX-FileCopyrightText: 2022 TomTom <http://tomtom.com>
 * SPDX-License-Identifier: Apache-2.0
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
    super("Commit Message is a 'merge' commit!");
    this.name = "MergeCommitError";
  }
}

export class FixupCommitError extends Error {
  constructor() {
    super("Commit Message is a 'fixup' commit!");
    this.name = "FixupCommitError";
  }
}

export class BumpError extends Error {
  constructor(msg) {
    super(`Error while applying version bump: ${msg}`);
    this.name = "BumpError";
  }
}
