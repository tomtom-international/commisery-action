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

import { Configuration } from "./config";
import { validateRules } from "./rules";
import {
  ConventionalCommitError,
  FixupCommitError,
  MergeCommitError,
} from "./errors";
import { SemVerType } from "./semver";

const os = require("os");

const BREAKING_CHANGE_TOKEN = "BREAKING-CHANGE";
const CONVENTIONAL_COMMIT_REGEX =
  /(?<type>\w+)?((\s*)?\((?<scope>[^()]*)\)(\s*)?)?(?<breaking_change>((\s*)+[!]+(\s*)?)?)(?<separator>((\s+)?:?(\s+)?))(?<description>.*)/;
const FOOTER_REGEX =
  /^(?<token>[\w\- ]+|BREAKING\sCHANGE)(?::[ ]|[ ](?=[#]))(?<value>.*)/;

/**
 * Conventional Commit Metadata used for validating
 * compliance with Conventional Commits
 */
export interface ConventionalCommitMetadata {
  body: string[];
  breaking_change: string;
  description: string;
  footers: Footer[];
  separator: string;
  scope: string;
  subject: string;
  type: string;
}

/**
 * Footer class containing key, value pairs
 */
class Footer {
  token: string;
  value: string;

  constructor(token: string, value: string) {
    this.token = token;
    if (token === "BREAKING CHANGE") {
      this.token = BREAKING_CHANGE_TOKEN;
    }

    this.value = value;
  }

  appendParagrah(paragrah: string) {
    this.value += os.EOL + paragrah;
  }
}

/**
 * Parses a commit message (array) and populates
 * the classes properties.
 */
export function getConventionalCommitMetadata(message: string[]) {
  let footers: Footer[] = [];
  let body: string[] = [];
  let has_breaking_change = false;

  if (message.length > 1) {
    var end_of_body = 1;
    message.slice(1).forEach((line, index) => {
      let matches = line.match(FOOTER_REGEX)?.groups;

      if (matches) {
        footers.push(new Footer(matches.token, matches.value));
        if (footers[footers.length - 1].token == BREAKING_CHANGE_TOKEN) {
          has_breaking_change = true;
        }
      } else if (footers.length > 0 && line.startsWith(" ")) {
        // Multiline trailers use folding
        footers[footers.length - 1].appendParagrah(line);
      } else if (has_breaking_change === true && line.trim() === "") {
        // Allow blank lines after BREAKING[- ]CHANGE
        if (footers[footers.length - 1].token !== BREAKING_CHANGE_TOKEN) {
          footers.push(new Footer("", ""));
        }
        return;
      } else {
        // Discard detected git trailers as non-compliant item has been found
        end_of_body = index + 1;
        footers = [];
      }
    });

    // Set the body
    if (end_of_body > 1) {
      body = message.slice(1, end_of_body + 1);
    } else {
      body = [message[end_of_body]];
    }
  }

  const conventional_subject = message[0].match(
    CONVENTIONAL_COMMIT_REGEX
  )?.groups;

  if (conventional_subject === undefined) {
    throw new Error(
      `Commit is not compliant to Conventional Commits (non-strict)`
    );
  }

  const metadata: ConventionalCommitMetadata = {
    body: body,
    footers: footers,
    type: conventional_subject.type,
    scope: conventional_subject.scope,
    subject: message[0],
    breaking_change: conventional_subject.breaking_change,
    separator: conventional_subject.separator,
    description: conventional_subject.description,
  };

  return metadata;
}

/**
 * Conventional Commit
 */
export class ConventionalCommitMessage {
  breaking_change: boolean;
  body: string | null;
  bump: SemVerType;
  config: Configuration;
  description: string;
  footers: Footer[];
  hexsha: string | undefined;
  scope: string | null;
  type: string | null;

  constructor(
    message: string,
    hexsha: string | undefined = undefined,
    config: Configuration = new Configuration()
  ) {
    const split_message: string[] = stripMessage(message).split(os.EOL);

    // Skip Mere and Fixup commits
    if (isMerge(split_message[0])) {
      throw new MergeCommitError();
    }

    if (isFixup(split_message[0])) {
      throw new FixupCommitError();
    }

    this.hexsha = hexsha;
    this.config = config;

    // Initializes class based on commit message
    const metadata = getConventionalCommitMetadata(split_message);
    if (metadata === undefined) {
      throw new ConventionalCommitError(
        `Commit is not a Conventional Commit type!`,
        []
      );
    }

    // Validate whether this is a valid Conventional Commit
    const errors = validateRules(metadata, this.config);

    if (errors.length > 0) {
      throw new ConventionalCommitError(
        `Commit is not compliant to Conventional Commits!`,
        errors
      );
    }

    this.body = metadata.body.slice(1).join(os.EOL);
    if (this.body === "") {
      this.body = null;
    }

    this.description = metadata.description;
    this.footers = metadata.footers;
    this.scope = metadata.scope ? metadata.scope : null;
    this.type = metadata.type ? metadata.type : null;

    this.bump = this.determineBump(metadata);
    this.breaking_change = this.bump === SemVerType.MAJOR;
  }

  determineBump(metadata: ConventionalCommitMetadata) {
    for (const footer of metadata.footers) {
      if (footer.token === BREAKING_CHANGE_TOKEN) {
        return SemVerType.MAJOR;
      }
    }
    if (metadata.type === undefined) {
      return SemVerType.NONE;
    }

    if (metadata.breaking_change === "!") {
      return SemVerType.MAJOR;
    }

    if (metadata.type.trim().toLowerCase() === "feat") {
      return SemVerType.MINOR;
    }

    if (metadata.type.trim().toLowerCase() === "fix") {
      return SemVerType.PATCH;
    }

    return SemVerType.NONE;
  }
}

function isFixup(subject: string) {
  const AUTOSQUASH_REGEX = /^(?:(?:fixup|squash)!\s+)+/;
  const autosquash = subject.match(AUTOSQUASH_REGEX);

  return autosquash !== null;
}

function isMerge(subject: string) {
  const MERGE_REGEX = /^Merge.*?:?[\s\t]*?/;
  const merge = subject.match(MERGE_REGEX);

  return merge !== null;
}

function stripMessage(message) {
  const cut_line = message.indexOf(
    "# ------------------------ >8 ------------------------\n"
  );

  if (cut_line >= 0 && (cut_line == 0 || message[cut_line - 1] == "\n")) {
    message = message.substring(cut_line);
  }

  // Strip comments
  message = message.replace(/^#[^\n]*\n?/, "");
  // Strip trailing whitespace from lines
  message = message.replace(/[ \t]+$/, "");
  // Remove empty lines from the beginning and end
  message = message.trim();

  return message;
}

module.exports = { ConventionalCommitMessage };
