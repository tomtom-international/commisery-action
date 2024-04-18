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
  RevertCommitError,
} from "./errors";
import { SemVerType } from "./semver";

import * as os from "os";

const BREAKING_CHANGE_TOKEN = "BREAKING-CHANGE";
const CONVENTIONAL_COMMIT_REGEX =
  /(?<type>\w+)?((\s*)?\((?<scope>[^()]*)\)(\s*)?)?(?<breakingChange>((\s*)+[!]+(\s*)?)?)(?<separator>((\s+)?:?(\s+)?))(?<description>.*)/;
const FOOTER_REGEX =
  /^(?<token>[\w-]+|BREAKING\sCHANGE|[\w-\s]+\sby)(?::[ ]|[ ](?=#))(?<value>.*)/;

/**
 * Conventional Commit Metadata used for validating
 * compliance with Conventional Commits
 */
export interface ConventionalCommitMetadata {
  body: string[];
  breakingChange: string;
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
  private _token!: string;
  private _value!: string;

  constructor(token: string, value: string) {
    this.token = token;
    this.value = value;
  }

  set token(token: string) {
    if (token === "BREAKING CHANGE") {
      this._token = BREAKING_CHANGE_TOKEN;
    } else {
      this._token = token;
    }
  }

  get token(): string {
    return this._token;
  }

  set value(value: string) {
    this._value = value;
  }

  // NOTE: Returns the value of the footer, without
  // any trailing whitespace or new line
  get value(): string {
    return this._value.trimEnd();
  }

  appendParagraph(paragraph: string): void {
    this._value += os.EOL + paragraph;
  }
}

/**
 * Parses a commit message (array) and populates
 * the classes properties.
 */
export function getConventionalCommitMetadata(
  message: string[]
): ConventionalCommitMetadata {
  let footers: Footer[] = [];
  let body: string[] = [];

  if (message.length > 1) {
    let endOfBody = 1;
    let ignoreEmptyLines = false;

    // eslint-disable-next-line github/array-foreach
    message.slice(1).forEach((line, index) => {
      const matches = FOOTER_REGEX.exec(line)?.groups;
      const currentTrailer = footers[footers.length - 1];
      if (matches) {
        footers.push(new Footer(matches.token, matches.value));
        ignoreEmptyLines = false;
      } else if (/^-{8,}$/.test(line)) {
        // End current trailer when a `---------` line is detected (i.e. as inserted
        // by GitHub for certain merge strategies).
        ignoreEmptyLines = true;
      } else if (ignoreEmptyLines && line.trim() === "") {
        // Ignore empty lines after `---------` line
        // until the next paragraph or footer element is detected.
      } else if (currentTrailer && (/^\s+/.test(line) || line.trim() === "")) {
        // Multiline trailers use folding (RFC822), the exception being for empty lines
        currentTrailer.appendParagraph(line);
      } else {
        // Discard detected git trailers as non-compliant item has been found
        endOfBody = index + 1;
        footers = [];
        ignoreEmptyLines = false;
      }
    });

    // Set the body
    if (endOfBody > 1) {
      body = message.slice(1, endOfBody + 1);
    } else {
      body = [message[endOfBody]];
    }
  }

  const conventionalSubject = CONVENTIONAL_COMMIT_REGEX.exec(
    message[0]
  )?.groups;

  if (conventionalSubject === undefined) {
    throw new Error(
      `Commit is not compliant to Conventional Commits (non-strict)`
    );
  }

  const metadata: ConventionalCommitMetadata = {
    body,
    footers,
    type: conventionalSubject.type,
    scope: conventionalSubject.scope,
    subject: message[0],
    breakingChange: conventionalSubject.breakingChange,
    separator: conventionalSubject.separator,
    description: conventionalSubject.description,
  };

  return metadata;
}

/**
 * Conventional Commit
 */
export class ConventionalCommitMessage {
  breakingChange: boolean;
  body: string | null;
  bump: SemVerType;
  config: Configuration;
  description: string;
  footers: Footer[];
  hexsha: string | undefined;
  scope: string | null;
  subject: string;
  type: string;

  constructor(
    message: string,
    hexsha: string | undefined = undefined,
    config: Configuration = new Configuration()
  ) {
    const splitMessage: string[] = stripMessage(message).split(os.EOL);

    // Skip merge-, fixup- and revert-commits
    if (isMerge(splitMessage[0])) {
      throw new MergeCommitError();
    }

    if (isFixup(splitMessage[0])) {
      throw new FixupCommitError();
    }

    if (isRevert(splitMessage[0])) {
      throw new RevertCommitError();
    }

    this.hexsha = hexsha;
    this.config = config;

    // Initializes class based on commit message
    const metadata = getConventionalCommitMetadata(splitMessage);
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
    this.type = metadata.type;
    this.subject = metadata.subject;

    this.bump = this.determineBump(metadata);
    this.breakingChange = this.bump === SemVerType.MAJOR;
  }

  determineBump(metadata: ConventionalCommitMetadata): SemVerType {
    for (const footer of metadata.footers) {
      if (footer.token === BREAKING_CHANGE_TOKEN) {
        return SemVerType.MAJOR;
      }
    }
    if (metadata.type === undefined) {
      return SemVerType.NONE;
    }

    if (metadata.breakingChange === "!") {
      return SemVerType.MAJOR;
    }

    if (metadata.type.trim() === "feat") {
      return SemVerType.MINOR;
    }

    const patchBumpingTypes: string[] = Object.entries(this.config.tags)
      .map(([key, value]) => (value.bump ? key : undefined))
      .filter((e): e is string => e !== undefined);

    if (!patchBumpingTypes.includes("fix")) patchBumpingTypes.push("fix");

    if (patchBumpingTypes.includes(metadata.type.trim())) {
      return SemVerType.PATCH;
    }

    return SemVerType.NONE;
  }
}

function isFixup(subject: string): boolean {
  return /^(?:(?:fixup|squash)!\s+)+/.test(subject);
}

function isMerge(subject: string): boolean {
  return /^Merge.*?:?[\s\t]*?/.test(subject);
}

function isRevert(subject: string): boolean {
  return subject.startsWith('Revert "');
}

function stripMessage(message: string): string {
  const cutLine = message.indexOf(
    "# ------------------------ >8 ------------------------\n"
  );

  if (cutLine >= 0 && (cutLine === 0 || message[cutLine - 1] === "\n")) {
    message = message.substring(cutLine);
  }

  // Strip comments
  message = message.replace(/^#[^\n]*\n?/, "");
  // Strip trailing whitespace from lines
  message = message.replace(/[ \t]+$/, "");
  // Remove empty lines from the beginning and end
  message = message.trim();

  return message;
}
