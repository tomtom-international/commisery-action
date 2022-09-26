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

import dedent from "dedent";

import { ConventionalCommitMessage } from "./commit";
import { getConventionalCommitRule, IConventionalCommitRule } from "./rules";
import { ConventionalCommitError } from "./errors";

function assertRuleValidationError(
  message: string,
  type: IConventionalCommitRule
) {
  expect(type).not.toBeUndefined();
  try {
    const msg = new ConventionalCommitMessage(message);
  } catch (error: any) {
    let foundError = false;

    if (!(error instanceof ConventionalCommitError)) {
      console.log(error);
    }

    expect(error).toBeInstanceOf(ConventionalCommitError);
    for (const err of error.errors) {
      if (err.message && err.message.startsWith(`[${type.id}]`)) {
        foundError = true;
        console.log(err.report());
      }
    }
    expect(foundError).toBe(true);
  }
}

function assertRuleNoValidationError(
  message: string,
  type: IConventionalCommitRule
) {
  expect(type).not.toBeUndefined();
  try {
    const msg = new ConventionalCommitMessage(message);
    expect(msg).toBeDefined();
  } catch (error: any) {
    let foundError = false;

    if (!(error instanceof ConventionalCommitError)) {
      console.log(error);
    }

    expect(error).toBeInstanceOf(ConventionalCommitError);
    for (const err of error.errors) {
      if (err.message && err.message.startsWith(`[${type.id}]`)) {
        foundError = true;
        console.log(err.report());
      }
    }
    expect(foundError).toBe(false);
  }
}

describe("Rules", () => {
  /**
   * The commit message's tag type should be in lower case
   */
  test("[C001] The commit message's tag type should be in lower case", () => {
    for (const message of [
      "Chore: did something",
      "CHORE: did something",
      "cHore: did something",
      " Chore: did something",
      "Chore : did something",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C001"));
    }

    for (const message of [
      "chore: did something",
      " chore: did something",
      "chore : did something",
      ": did something",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C001"));
    }
  });

  /**
   * Only one empty line between subject and body
   */
  test("[C002] Only one empty line between subject and body", () => {
    for (const message of [
      dedent(`feat: single line body
        
        
        This is the body`),
      dedent(`feat: footer only
        
        
        Implements: 123`),
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C002"));
    }

    for (const message of [
      "feat: no body",
      dedent(`feat: single line body
        
        This is the body`),
      dedent(`feat: footer only
        
        Implements: 123`),
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C002"));
    }
  });

  /**
   * [C003] The commit message's description should not start with a capital case letter
   */
  test("[C003] The commit message's description should not start with a capital case letter", () => {
    for (const message of [
      "feat: Check rule",
      "feat : Check rule",
      "feat:Check rule",
      "feat :Check rule",
      "feat:  Check rule",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C003"));
    }

    for (const message of [
      "feat: check rule",
      "feat: cHeck rule",
      "feat:check rule",
      "feat:   check rule",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C003"));
    }
  });

  /**
   * [C004] Commit message's subject should not contain an unknown tag type
   */
  test("[C004] Commit message's subject should not contain an unknown tag type", () => {
    for (const message of [
      "awesome: type does not exist",
      "fox : type does not exist",
      "feet:type does not exist",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C004"));
    }

    for (const message of [
      "feat: type exists",
      "fix: type exists",
      ": type does not exist",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C004"));
    }
  });

  /**
   * [C005] Only one whitespace allowed after the ":" separator
   */
  test('[C005] Only one whitespace allowed after the ":" separator', () => {
    for (const message of [
      "feat:no whitespace",
      "feat:  two whitespaces",
      "feat:   three whitespaces",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C005"));
    }
    assertRuleNoValidationError(
      "feat: one whitespace",
      getConventionalCommitRule("C005")
    );
  });

  /**
   * [C006] The commit message's scope should not be empty
   */
  test("[C006] The commit message's scope should not be empty", () => {
    for (const message of [
      "feat(): empty scope",
      "feat( ): scope only whitespaces",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C006"));
    }

    for (const message of ["feat: no scope", "feat(test): scope"]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C006"));
    }
  });

  /**
   * [C007] The commit message's scope should not contain any whitespacing
   */
  test("[C007] The commit message's scope should not contain any whitespacing", () => {
    for (const message of [
      "feat( test): whitespace before scope",
      "feat(test ): whitespace after scope",
      "feat( test ): whitespace around scope",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C007"));
    }

    for (const message of ["feat: no scope", "feat(test): scope"]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C007"));
    }
  });

  /**
   * [C008] The commit message's subject requires a separator (": ") after the type tag
   */
  test(`[C008] The commit message's subject requires a separator (": ") after the type tag`, () => {
    for (const message of [
      "feat missing seperator",
      "feat(test) missing seperator",
      "feat ! missing seperator",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C008"));
    }

    for (const message of [
      "feat: contains seperator",
      "feat!: breaking with seperator",
      "feat(scope): with scope",
      "feat(scope)!: with scope and breaking",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C008"));
    }
  });

  /**
   * [C009] The commit message requires a description
   */
  test(`[C009] The commit message requires a description`, () => {
    for (const message of ["feat:", "feat: "]) {
      assertRuleValidationError(message, getConventionalCommitRule("C009"));
    }

    for (const message of [
      "feat:description without whitespace",
      "feat: description with whitespace",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C009"));
    }
  });

  /**
   * [C010] No whitespace allowed around the "!" indicator
   */
  test(`[C010] No whitespace allowed around the "!" indicator`, () => {
    for (const message of [
      "feat !: breaking change",
      "feat! : breaking change",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C010"));
    }

    for (const message of [
      "feat!: breaking change",
      "feat(scope)!: breaking change",
      "feat(scope)!:breaking change",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C010"));
    }
  });

  /**
   * [C011] Breaking separator should consist of only one indicator
   */
  test(`[C011] Breaking separator should consist of only one indicator`, () => {
    for (const message of [
      "feat!!: breaking change",
      "feat!!! : breaking change",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C011"));
    }

    for (const message of [
      "feat!: breaking change",
      "feat(scope)!: breaking change",
      "feat(scope)!:breaking change",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C011"));
    }
  });

  /**
   * [C012] The commit message's subject requires a type
   */
  test(`[C012] The commit message's subject requires a type`, () => {
    for (const message of [
      ": missing type",
      "  : multispace type",
      "  !:breaking multispace",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C012"));
    }

    for (const message of [
      "chore: this is a chore",
      "feat(scope)!: breaking change with scope",
      "fix:fix without whitespacing",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C012"));
    }
  });

  /**
   * [C013] The commit message's subject should not end with punctuation
   */
  test(`[C013] The commit message's subject should not end with punctuation`, () => {
    for (const message of [
      "feat: ends with a!",
      "fix: ends with a?",
      "chore!: ends with a.",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C013"));
    }

    for (const message of [
      "chore: this is a chore",
      "feat(scope)!: breaking change with scope",
      "fix:fix without whitespacing",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C013"));
    }
  });

  /**
   * [C014] The commit message's subject should be within the line length limit
   */
  test(`[C014] The commit message's subject should be within the line length limit`, () => {
    for (const message of [
      "feat: 789012345678901234567890123456789012345678901234567890123456789012345678901",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C014"));
    }

    for (const message of [
      "chore: this is a chore",
      "feat(scope)!: breaking change with scope",
      "fix:fix without whitespacing",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C014"));
    }
  });

  /**
   * [C015] Description should not start with a repetition of the tag
   */
  test(`[C015] Description should not start with a repetition of the tag`, () => {
    for (const message of ["feat: feat", "fix: fix"]) {
      assertRuleValidationError(message, getConventionalCommitRule("C015"));
    }

    for (const message of [
      "chore: this is a chore",
      "feat(scope)!: breaking change with scope",
      "fix:fix without whitespacing",
      "fix: fixed",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C015"));
    }
  });
});
