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

const difflib = require("difflib");

import { ConventionalCommitMetadata } from "./commit";
import { Configuration } from "./config";
import { LlvmError, LlvmRange } from "./logging";

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

export function validateRules(
  message: ConventionalCommitMetadata,
  config: Configuration
) {
  const rules = [
    C001_non_lower_case_type,
    C002_one_whiteline_between_subject_and_body,
    C003_title_case_description,
    C004_unknown_tag_type,
    C005_separator_contains_trailing_whitespaces,
  ];

  let errors: LlvmError[] = [];

  for (const rule of rules) {
    try {
      rule(message, config);
    } catch (error) {
      if (error instanceof LlvmError) {
        errors.push(error);
      } else {
        throw error;
      }
    }
  }

  return errors;
}

/**
 * The commit message's tag type should be in lower case
 */
function C001_non_lower_case_type(
  message: ConventionalCommitMetadata,
  _: Configuration
) {
  /*if (message.isMerge()) {
    return;
  }*/

  if (message.type === undefined || message.type.trim() === "") {
    return;
  }

  if (message.type.toLowerCase() !== message.type) {
    let msg = new LlvmError();
    msg.message =
      "[C001] The commit message's tag type should be in lower case";
    msg.line = message.subject;
    msg.column_number = new LlvmRange(
      message.subject.indexOf(message.type) + 1,
      message.type.length
    );
    msg.expectations = message.type.toLowerCase();

    throw msg;
  }
}

/**
 * Only one empty line between subject and body
 */
function C002_one_whiteline_between_subject_and_body(
  message: ConventionalCommitMetadata,
  _: Configuration
) {
  if (message.body === undefined) {
    // || message.isMerge()) {
    return;
  }

  if (message.body.length >= 2 && message.body[1].trim() === "") {
    let msg = new LlvmError();
    msg.message = "[C002] Only one empty line between subject and body";
    msg.line = message.subject;

    throw msg;
  }
}

/**
 * The commit message's description should not start with a capital case letter
 */
function C003_title_case_description(
  message: ConventionalCommitMetadata,
  _: Configuration
) {
  if (
    //message.isMerge() ||
    message.description === undefined ||
    message.description.trim() === ""
  ) {
    return;
  }

  if (message.description[0] !== message.description[0].toLowerCase()) {
    let msg = new LlvmError();
    msg.message =
      "[C003] The commit message's description should not start with a capital case letter";
    msg.line = message.subject;
    msg.column_number = new LlvmRange(
      message.subject.indexOf(message.description) + 1
    );
    msg.expectations = message.description[0].toLowerCase();

    throw msg;
  }
}

/**
 * Commit message's subject should not contain an unknown tag type
 */
function C004_unknown_tag_type(
  message: ConventionalCommitMetadata,
  config: Configuration
) {
  if (message.type === undefined) {
    // || message.isMerge()
    return;
  }

  if (!(message.type in config.tags)) {
    const matches = difflib.getCloseMatches(
      message.type.toLowerCase(),
      Object.keys(config.tags)
    );
    const closest_match = matches
      ? matches[0]
      : Object.keys(config.tags).join(", ");

    let msg = new LlvmError();
    msg.message = `[C004] Commit message's subject should not contain an unknown tag type. Use one of: ${Object.keys(
      config.tags
    ).join(", ")}`;
    msg.line = message.subject;
    msg.column_number = new LlvmRange(
      message.subject.indexOf(message.type) + 1,
      message.type.length
    );
    msg.expectations = closest_match;

    throw msg;
  }
}

function C005_separator_contains_trailing_whitespaces(
  message: ConventionalCommitMetadata,
  _: Configuration
) {
  if (message.separator === undefined || message.separator.trim() === "") {
    // || message.isMerge()
    return;
  }

  if (message.separator !== ": ") {
    let msg = new LlvmError();
    msg.message = '[C005] Only one whitespace allowed after the ":" separator';
    msg.line = message.subject;
    msg.expectations = `: ${message.description}`;
  }
}
