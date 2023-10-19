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

import * as difflib from "difflib";

import { ConventionalCommitMetadata } from "./commit";
import { Configuration } from "./config";
import { LlvmError } from "./logging";

export interface IConventionalCommitRule {
  description: string;
  id: string;
  default: boolean;

  validate: (
    message: ConventionalCommitMetadata,
    config: Configuration
  ) => void;
}

/**
 * Validates the commit message against the specified ruleset
 */
export function validateRules(
  message: ConventionalCommitMetadata,
  config: Configuration
): LlvmError[] {
  const errors: LlvmError[] = [];

  const disabledRules = Object.entries(config.rules)
    .filter(item => !(item[1] as Object)["enabled"])
    .map(item => item[0]);

  for (const rule of ALL_RULES) {
    try {
      if (!disabledRules.includes(rule.id)) {
        rule.validate(message, config);
      }
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

const ISSUE_REGEX_IGNORED_KEYWORDS = ["AES", "CVE", "PEP", "SHA", "UTF", "VT"];
const ISSUE_REGEX = new RegExp(
  `(?!\\b(?:${ISSUE_REGEX_IGNORED_KEYWORDS.join(
    "|"
  )})\\b)\\b[A-Z]+-[0-9]+\\b(?!-)`
);

/**
 */
class NonLowerCaseType implements IConventionalCommitRule {
  id = "C001";
  description = "Type tag should be in lower case";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (message.type === undefined) {
      return;
    }
    if (message.type.toLowerCase() !== message.type) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
        columnNumber: {
          start: message.subject.indexOf(message.type) + 1,
          range: message.type.length,
        },
        expectations: message.type.toLowerCase(),
      });
    }
  }
}

/**
 * Only one empty line between subject and body
 */
class OneWhitelineBetweenSubjectAndBody implements IConventionalCommitRule {
  id = "C002";
  description = "Only one empty line between subject and body";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (message.body.length >= 2 && message.body[1].trim() === "") {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
      });
    }
  }
}

/**
 * Description should not start with a capital case letter
 */
class TitleCaseDescription implements IConventionalCommitRule {
  id = "C003";
  description = "Description should not start with a capital case letter";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (
      message.description &&
      !message.description.startsWith(message.description[0].toLowerCase())
    ) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
        columnNumber: {
          start: message.subject.indexOf(message.description) + 1,
        },
        expectations: message.description[0].toLowerCase(),
      });
    }
  }
}

/**
 * Subject should not contain an unknown type tag
 */
class UnknownTagType implements IConventionalCommitRule {
  id = "C004";
  description = "Subject should not contain an unknown tag type";
  default = true;

  validate(message: ConventionalCommitMetadata, config: Configuration): void {
    if (message.type === undefined) {
      return;
    }

    if (!(message.type in config.tags)) {
      const matches = difflib.getCloseMatches(
        message.type.toLowerCase(),
        Object.keys(config.tags)
      );
      const closestMatch = matches
        ? matches[0]
        : Object.keys(config.tags).join(", ");

      throw new LlvmError({
        message: `[${this.id}] ${this.description}. Use one of: ${Object.keys(
          config.tags
        ).join(", ")}`,
        line: message.subject,
        columnNumber: {
          start: message.subject.indexOf(message.type) + 1,
          range: message.type.length,
        },
        expectations: closestMatch,
      });
    }
  }
}

/**
 * Zero spaces before and only one space allowed after the ":" separator
 */
class SeparatorContainsTrailingWhitespaces implements IConventionalCommitRule {
  id = "C005";
  description =
    'Zero spaces before and only one space allowed after the ":" separator';
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (message.separator === null) {
      return;
    }

    if (message.separator !== ": ") {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
        columnNumber: {
          start: message.subject.indexOf(message.separator) + 1,
          range: message.separator.length,
        },
        expectations: `: `,
      });
    }
  }
}

/**
 * Scope should not be empty
 */
class ScopeShouldNotBeEmpty implements IConventionalCommitRule {
  id = "C006";
  description = "Scope should not be empty";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (message.scope === undefined) {
      return;
    }

    if (!message.scope.trim()) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
        columnNumber: {
          start: message.subject.indexOf("(") + 1,
          range: message.scope.length + 2,
        },
      });
    }
  }
}

/**
 * Scope should not contain any whitespace
 */
class ScopeContainsWhitespace implements IConventionalCommitRule {
  id = "C007";
  description = "Scope should not contain any whitespace";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (message.scope && message.scope.length !== message.scope.trim().length) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
        columnNumber: {
          start: message.subject.indexOf("(") + 2,
          range: message.scope.length,
        },
        expectations: message.scope.trim(),
      });
    }
  }
}

/**
 * Subject requires a separator (": ") after the type tag
 */
class MissingSeparator implements IConventionalCommitRule {
  id = "C008";
  description = `Subject requires a separator (": ") after the type tag`;
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (message.separator === undefined || !message.separator.includes(":")) {
      const columnNumber = {
        start: Math.max(1, message.subject.indexOf(" ") + 1),
      };

      if (message.scope) {
        columnNumber.start =
          message.subject.indexOf(message.scope) + message.scope.length + 2;
      } else if (message.breakingChange) {
        columnNumber.start = message.subject.indexOf(message.breakingChange);
      }

      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
        columnNumber,
        expectations: `:`,
      });
    }
  }
}

/**
 * Subject requires a description
 */
class MissingDescription implements IConventionalCommitRule {
  id = "C009";
  description = "Subject requires a description";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (!message.description) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
        columnNumber: { start: message.subject.length + 2 },
      });
    }
  }
}

/**
 * No whitespace allowed around the "!" indicator
 */
class BreakingIndicatorContainsWhitespacing implements IConventionalCommitRule {
  id = "C010";
  description = 'No whitespace allowed around the "!" indicator';
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (
      message.breakingChange &&
      message.breakingChange.trim() !== message.breakingChange
    ) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
        columnNumber: {
          start: message.subject.indexOf(message.breakingChange) + 1,
          range:
            message.breakingChange.length + message.separator.trimEnd().length,
        },
        expectations: `!:`,
      });
    }
  }
}

/**
 * Breaking separator should consist of only one indicator
 */
class OnlySingleBreakingIndicator implements IConventionalCommitRule {
  id = "C011";
  description = "Breaking separator should consist of only one indicator";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (message.breakingChange && message.breakingChange.trim().length > 1) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
        columnNumber: {
          start: message.subject.indexOf(message.breakingChange) + 1,
          range: message.breakingChange.length + 1,
        },
        expectations: `!:`,
      });
    }
  }
}

/**
 * Subject requires a type
 */
class MissingTypeTag implements IConventionalCommitRule {
  id = "C012";
  description = "Subject requires a type";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (!message.type) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
      });
    }
  }
}

/**
 * Subject should not end with punctuation
 */
class SubjectShouldNotEndWithPunctuation implements IConventionalCommitRule {
  id = "C013";
  description = "Subject should not end with punctuation";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (message.description.match(/.*[.!?,]$/)) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
        columnNumber: { start: message.subject.length },
      });
    }
  }
}

/**
 * Subject should be within the line length limit
 */
class SubjectExceedsLineLengthLimit implements IConventionalCommitRule {
  id = "C014";
  description = "Subject should be within the line length limit";
  default = true;

  validate(message: ConventionalCommitMetadata, config: Configuration): void {
    if (message.subject.length > config.maxSubjectLength) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description} (${
          config.maxSubjectLength
        }), exceeded by ${
          message.subject.length - config.maxSubjectLength + 1
        } characters`,
        line: message.subject,
        columnNumber: {
          start: config.maxSubjectLength,
          range: message.subject.length - config.maxSubjectLength + 1,
        },
      });
    }
  }
}

/**
 * Description should not start with a repetition of the tag
 */
class NoRepeatedTags implements IConventionalCommitRule {
  id = "C015";
  description = "Description should not start with a repetition of the tag";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (message.description === undefined || message.type === undefined) {
      return;
    }
    if (
      message.description.split(" ")[0].toLowerCase() ===
      message.type.toLowerCase()
    ) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
        columnNumber: {
          start:
            message.subject.indexOf(message.separator) +
            message.separator.length +
            1,
          range: message.type.length,
        },
      });
    }
  }
}

/**
 * Description should be written in imperative mood
 */
class DescriptionInImperativeMood implements IConventionalCommitRule {
  id = "C016";
  description = "Description should be written in imperative mood";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    const commonNonImperativeVerbs = [
      "added",
      "adds",
      "adding",
      "applied",
      "applies",
      "applying",
      "edited",
      "edits",
      "editing",
      "expanded",
      "expands",
      "expanding",
      "fixed",
      "fixes",
      "fixing",
      "removed",
      "removes",
      "removing",
      "renamed",
      "renames",
      "renaming",
      "deleted",
      "deletes",
      "deleting",
      "updated",
      "updates",
      "updating",
      "ensured",
      "ensures",
      "ensuring",
      "resolved",
      "resolves",
      "resolving",
      "verified",
      "verifies",
      "verifying",
    ];
    if (
      message.description.match(
        new RegExp(`^(${commonNonImperativeVerbs.join("|")})`, "i")
      )
    ) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
        columnNumber: {
          start: message.subject.indexOf(message.description) + 1,
          range: message.description.split(" ")[0].length,
        },
      });
    }
  }
}

/**
 * Subject should not contain reference to review comments
 */
class SubjectContainsReviewRemarks implements IConventionalCommitRule {
  id = "C017";
  description = "Subject should not contain reference to review comments";
  default = true;

  validate(_: ConventionalCommitMetadata, __: Configuration): void {
    // TODO: implement this rule
  }
}

/**
 * Commit message should contain an empty line between subject and body
 */
class MissingEmptyLineBetweenSubjectAndBody implements IConventionalCommitRule {
  id = "C018";
  description =
    "Commit message should contain an empty line between subject and body";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (message.body && message.body[0]) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
      });
    }
  }
}

/**
 * Subject should not contain a ticket reference
 */
class SubjectContainsIssueReference implements IConventionalCommitRule {
  id = "C019";
  description = "Subject should not contain a ticket reference";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    const match = ISSUE_REGEX.exec(message.subject);
    if (match) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
        line: message.subject,
        columnNumber: {
          start: match.index + 1,
          range: match[0].length,
        },
      });
    }
  }
}

/**
 * Git-trailer should not contain whitespace
 */
class GitTrailerContainsWhitespace implements IConventionalCommitRule {
  id = "C020";
  description = "Git-trailer should not contain whitespace";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    for (const item of message.footers) {
      if (item.token.includes(" ")) {
        throw new LlvmError({
          message: `[${this.id}] ${this.description}`,
          line: `${item.token}: ${item.value}`,
          columnNumber: {
            start: 1,
            range: item.token.length,
          },
          expectations: item.token.replace(/ /g, "-"),
        });
      }
    }
  }
}

/**
 * Footer should not contain any blank line(s)
 */
class FooterContainsBlankLine implements IConventionalCommitRule {
  id = "C022";
  description = "Footer should not contain any blank line(s)";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    for (const item of message.footers) {
      if (!item.token || item.value.length === 0) {
        throw new LlvmError({
          message: `[${this.id}] ${this.description}`,
        });
      }
    }
  }
}

/**
 * The BREAKING CHANGE git-trailer should be the first element in the footer
 */
class BreakingChangeMustBeFirstGitTrailer implements IConventionalCommitRule {
  id = "C023";
  description =
    "The BREAKING CHANGE git-trailer should be the first element in the footer";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    // eslint-disable-next-line github/array-foreach
    message.footers.forEach((item, index) => {
      if (item.token === "BREAKING-CHANGE") {
        if (index === 0) {
          return;
        }
        throw new LlvmError({
          message: `[${this.id}] ${this.description}`,
        });
      }
    });
  }
}

/**
 * A colon is required in git-trailers
 */
class GitTrailerNeedAColon implements IConventionalCommitRule {
  id = "C024";
  description = "A colon is required in git-trailers";
  default = true;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    const trailerFormats = [
      /^Addresses:* (?:[A-Z]+-[0-9]+|#[0-9]+)/,
      /^Closes:* (?:[A-Z]+-[0-9]+|#[0-9]+)/,
      /^Fixes:* (?:[A-Z]+-[0-9]+|#[0-9]+)/,
      /^Implements:* (?:[A-Z]+-[0-9]+|#[0-9]+)/,
      /^References:* (?:[A-Z]+-[0-9]+|#[0-9]+)/,
      /^Refs:* (?:[A-Z]+-[0-9]+|#[0-9]+)/,
      /^Acked-by/,
      /^Authored-by/,
      /^BREAKING CHANGE/,
      /^BREAKING-CHANGE/,
      /^Co-authored-by/,
      /^Helped-by/,
      /^Merged-by/,
      /^Reported-by/,
      /^Reviewed-by/,
      /^Signed-off-by/,
    ];
    // If a trailer doesn't have a colon, it won't be in the footers list,
    // so we examine the body here, from the bottom to the top.
    for (let i = message.body.length - 1; i >= 0; --i) {
      const line = message.body[i];

      // The one exception we need to handle is "BREAKING CHANGE"
      const checkLine = line.replace(/^BREAKING CHANGE/, "BREAKING-CHANGE");
      if (trailerFormats.some(key => checkLine.match(key))) {
        if (checkLine.match(/^[A-Za-z0-9-]+ /)) {
          const idx = checkLine.indexOf(" ");
          throw new LlvmError({
            message: `[${this.id}] ${this.description}`,
            line,
            columnNumber: {
              start: idx + 1,
              range: line.substring(idx).length,
            },
            expectations: `: ${line.substring(idx + 1)}`,
          });
        }
      }
    }
  }
}

/* Rule ID C025 was historically known as:
 *     SingleTicketReferencePerTrailer
 * with description:
 *     "Only a single ticket or issue may be referenced per trailer";
 * This rule has been removed and its ID should therefore not be re-used.
 */

/**
 * A ticket reference is required in at least one footer value
 */
class FooterContainsTicketReference implements IConventionalCommitRule {
  id = "C026";
  description = "A ticket reference is required in at least one footer value";
  default = false;

  validate(message: ConventionalCommitMetadata, _: Configuration): void {
    if (!message.footers.some(footer => ISSUE_REGEX.exec(footer.value))) {
      throw new LlvmError({
        message: `[${this.id}] ${this.description}`,
      });
    }
  }
}

export const ALL_RULES = [
  new NonLowerCaseType(),
  new OneWhitelineBetweenSubjectAndBody(),
  new TitleCaseDescription(),
  new UnknownTagType(),
  new SeparatorContainsTrailingWhitespaces(),
  new ScopeShouldNotBeEmpty(),
  new ScopeContainsWhitespace(),
  new MissingSeparator(),
  new MissingDescription(),
  new BreakingIndicatorContainsWhitespacing(),
  new OnlySingleBreakingIndicator(),
  new MissingTypeTag(),
  new SubjectShouldNotEndWithPunctuation(),
  new SubjectExceedsLineLengthLimit(),
  new NoRepeatedTags(),
  new DescriptionInImperativeMood(),
  new SubjectContainsReviewRemarks(),
  new MissingEmptyLineBetweenSubjectAndBody(),
  new SubjectContainsIssueReference(),
  new GitTrailerContainsWhitespace(),
  new FooterContainsBlankLine(),
  new BreakingChangeMustBeFirstGitTrailer(),
  new GitTrailerNeedAColon(),
  new FooterContainsTicketReference(),
];

export function getConventionalCommitRule(id: string): IConventionalCommitRule {
  for (const rule of ALL_RULES) {
    if (rule.id === id) {
      return rule;
    }
  }
  throw new Error(`Unknown rule: ${id}`);
}
