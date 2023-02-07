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

import { ConventionalCommitMessage } from "../src/commit";
import {
  getConventionalCommitRule,
  IConventionalCommitRule,
} from "../src/rules";
import { ConventionalCommitError } from "../src/errors";
import { Configuration } from "../src/config";

function assertRuleValidationError(
  message: string,
  type: IConventionalCommitRule,
  config: Configuration = new Configuration()
) {
  expect(type).not.toBeUndefined();
  try {
    const msg = new ConventionalCommitMessage(message, undefined, config);
    expect(msg).not.toBeDefined();
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
  type: IConventionalCommitRule,
  config: Configuration = new Configuration()
) {
  expect(type).not.toBeUndefined();
  try {
    const msg = new ConventionalCommitMessage(message, undefined, config);
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
    const config = new Configuration();
    config.maxSubjectLength = 100;

    for (const message of [
      `feat: ${"0".repeat(95)}`,
      `feat: ${"0".repeat(100)}`,
      `feat: ${"0".repeat(1000)}`,
    ]) {
      assertRuleValidationError(
        message,
        getConventionalCommitRule("C014"),
        config
      );
    }

    for (const message of [
      `feat: ${"0".repeat(94)}`,
      "chore: this is a chore",
      "feat(scope)!: breaking change with scope",
      "fix:fix without whitespacing",
    ]) {
      assertRuleNoValidationError(
        message,
        getConventionalCommitRule("C014"),
        config
      );
    }
  });

  /**
   * [C015] Description should not start with a repetition of the tag
   */
  test(`[C015] Description should not start with a repetition of the tag`, () => {
    for (const message of [
      "feat: feat",
      "fix: fix",
      "fix:fix without whitespacing",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C015"));
    }

    for (const message of [
      "chore: this is a chore",
      "feat(scope)!: breaking change with scope",
      "fix: fixed",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C015"));
    }
  });

  /**
   * [C016] The commit message's description should be written in imperative mood
   */
  test(`[C016] The commit message's description should be written in imperative mood`, () => {
    for (const message of [
      "feat: adds something",
      "fix: removes something else",
      "chore:renamed without spacing",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C016"));
    }

    for (const message of [
      "chore: this is a chore",
      "feat(scope)!: breaking change with scope",
      "chore: remove API call",
      "fix(ttlock): use new traffic-client that has updated gtest",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C016"));
    }
  });

  /**
   * [C017] Subject should not contain reference to review comments
   */
  test(`[C017] Subject should not contain reference to review comments`, () => {
    // TODO: Implement rule
  });

  /**
   * [C018] The commit message should contain an empty line between subject and body
   */
  test(`[C018] The commit message should contain an empty line between subject and body`, () => {
    for (const message of [
      dedent(`feat: missing empty line between subject and body
      This is the body`),
      dedent(`feat: missing empty line between subject and footer
      Implements: 1234`),
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C018"));
    }

    for (const message of [
      dedent(`feat: one empty line
      
      This is the body`),
      dedent(`feat(scope)!: multiple empty lines
      

      This is the body
      `),
      dedent(`chore: footers after one whiteline
      
      Implements: 1234`),
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C018"));
    }
  });

  /**
   * [C019] The commit message's subject should not contain a ticket reference
   */
  test(`[C019] The commit message's subject should not contain a ticket reference`, () => {
    for (const message of [
      "feat(ISS-1): add something",
      "fix: [ISS-2] do something",
      "chore: based on ISS-3",
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C019"));
    }

    for (const message of [
      dedent(`chore: this is a chore
      
      Implementation of ISS-1`),
      dedent(`feat(scope)!: breaking change with scope
      
      Implements: ISS-1`),
      "chore: remove UTF-8 implementation",
      "fix(server): add mitigation for CVE-1234-34567",
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C019"));
    }
  });

  /**
   * [C020] Git-trailer should not contain whitespace(s)
   */
  test(`[C020] Git-trailer should not contain whitespace(s)`, () => {
    for (const message of [
      dedent(`feat: multiple whitespaces in footers
      
      correct-token: value
      Co-Authored by: value
      Approved by: value`),
      dedent(`feat: body containing colon

      Start of body describing the changes.

      Approved by: value
      Addresses: value
      `),
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C020"));
    }

    for (const message of [
      dedent(`feat: one empty line
      
      Implements: 1234`),
      dedent(`feat(scope)!: multiple empty lines
      

      Correct-token: value
      Implements #1234
      `),
      dedent(`chore: footers after one whiteline
      
      Implements #1234
      Implements: 1234`),
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C020"));
    }
  });

  /**
   * [C022] Footer should not contain any blank line(s)
   */
  test(`[C022] Footer should not contain any blank line(s)`, () => {
    for (const message of [
      dedent(`feat: multiple whitespaces in footers
      
      BREAKING CHANGE: Now we allow for whitespaces

      correct-token: value

      Implements: 1234`),
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C022"));
    }

    for (const message of [
      dedent(`feat: one empty line
      
      Implements: 1234`),
      dedent(`feat(scope)!: multiple empty lines
      

      Correct-token: value
      Implements #1234
      `),
      dedent(`chore: footers after one whiteline
      
      Implements #1234
      Implements: 1234`),
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C022"));
    }
  });

  /**
   * [C024] A colon is required in git-trailers
   */
  test(`[C024] A colon is required in git-trailers`, () => {
    for (const message of [
      dedent(`feat: single line body with addresses

      Addresses TICKET-1234`),
      dedent(`feat: single line body with implements

      Implements OTHERTICKET-1234`),
      dedent(`feat: two-line body

      Make things.
      Addresses TICKET-1234, TICKET-2345 and TICKETj-8731
      Addresses TICKET-1234 and TICKET-2345, TICKETj-8731

      Reviewed-by: R. Blythe`),
      dedent(`test: keyword in body
      
      Addresses 321 and 322 were not available, so we use address 323.

      Fixes SOMETHING-123

      Refs: TICKET-1234`),
    ]) {
      assertRuleValidationError(message, getConventionalCommitRule("C024"));
    }

    for (const message of [
      dedent(`test: keyword in body

        Addresses 321 and 322 were not available, so we use address 323.

        Implements: TICKET-1234`),
      dedent(`feat: use default trailer keyword

        References: TICKET-1234

        BREAKING CHANGE: This should go above, but it shouldn't trigger this rule,
          what with there being a space in the trailer keyword and such.`),
    ]) {
      assertRuleNoValidationError(message, getConventionalCommitRule("C024"));
    }
  });

  /**
   * [C026] A ticket reference is required in at least one footer value
   */
  test(`[C026] A ticket reference is required in at least one footer value`, () => {
    const config = new Configuration();
    config.rules["C026"].enabled = true;

    for (const message of [
      "test: no footer",
      "test(TICKET-1234): ticket reference in subject",
      dedent(`test: single footer, no ticket reference

        Token: Value`),
      dedent(`test: single footer, ticket reference in token

        TICKET-1234: Implements`),
      dedent(`test: multiple footers, keywords instead of ticket references

        Implements: AES-128, CVE-123, PEP-8, SHA-256, UTF-16, VT-123
        Token: Value`),
    ]) {
      assertRuleValidationError(
        message,
        getConventionalCommitRule("C026"),
        config
      );
    }

    for (const message of [
      dedent(`test: one footer, one ticket reference

        Fixes: ISS-1`),
      dedent(`test: one footer, multiple ticket references

        Fixes: ISS-1, TICKET-1234`),
      dedent(`test: multiple footers, one ticket reference

        Token: Value
        Implements: TICKET-1234`),
      dedent(`test: multiple footer, multiple ticket references

        Fixes: ISS-1
        Implements: TICKET-1234
        Token: Value
        `),
    ]) {
      assertRuleNoValidationError(
        message,
        getConventionalCommitRule("C026"),
        config
      );
    }
  });
});
