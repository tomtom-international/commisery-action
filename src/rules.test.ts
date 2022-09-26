import dedent from "dedent";

import { ConventionalCommitMessage } from "./commit";
import { SemVerType } from "./semver";
import { LlvmError } from "./logging";
import {
  ConventionalCommitError,
  FixupCommitError,
  MergeCommitError,
} from "./rules";

function assertRuleValidationError(message: string, type: string) {
  try {
    const msg = new ConventionalCommitMessage(message);
  } catch (error: any) {
    let foundError = false;

    if (!(error instanceof ConventionalCommitError)) {
      console.log(message, error);
    }

    expect(error).toBeInstanceOf(ConventionalCommitError);
    for (const err of error.errors) {
      if (err.message && err.message.startsWith(`[${type}]`)) {
        foundError = true;
      }
    }
    expect(foundError).toBe(true);
  }
}

function assertRuleNoValidationError(message: string, type: string) {
  try {
    const msg = new ConventionalCommitMessage(message);
    expect(msg).toBeDefined();
  } catch (error: any) {
    let foundError = false;

    if (!(error instanceof ConventionalCommitError)) {
      console.log(message, error);
    }

    expect(error).toBeInstanceOf(ConventionalCommitError);
    for (const err of error.errors) {
      if (err.message && err.message.startsWith(`[${type}]`)) {
        foundError = true;
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
      assertRuleValidationError(message, "C001");
    }

    for (const message of [
      "chore: did something",
      " chore: did something",
      "chore : did something",
      ": did something",
    ]) {
      assertRuleNoValidationError(message, "C001");
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
      assertRuleValidationError(message, "C002");
    }

    for (const message of [
      "feat: no body",
      dedent(`feat: single line body
        
        This is the body`),
      dedent(`feat: footer only
        
        Implements: 123`),
    ]) {
      assertRuleNoValidationError(message, "C002");
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
      assertRuleValidationError(message, "C003");
    }

    for (const message of [
      "feat: check rule",
      "feat: cHeck rule",
      "feat:check rule",
      "feat:   check rule",
    ]) {
      assertRuleNoValidationError(message, "C003");
    }
  });

  /**
   * [C004] Commit message's subject should not contain an unknown tag type
   */
  test("[C004] Commit message's subject should not contain an unknown tag type", () => {
    for (const message of [
      "awesome: type does not exist",
      "awesome : type does not exist",
      "awesome:type does not exist",
      ": type does not exist",
    ]) {
      assertRuleValidationError(message, "C004");
    }

    for (const message of ["feat: type exists", "fix: type exists"]) {
      assertRuleNoValidationError(message, "C004");
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
      assertRuleValidationError(message, "C005");
    }
    assertRuleNoValidationError("feat: one whitespace", "C005");
  });

  /**
   * [C006] The commit message's scope should not be empty
   */
  test("[C006] The commit message's scope should not be empty", () => {
    for (const message of [
      "feat(): empty scope",
      "feat( ): scope only whitespaces",
    ]) {
      assertRuleValidationError(message, "C006");
    }

    for (const message of ["feat: no scope", "feat(test): scope"]) {
      assertRuleNoValidationError(message, "C006");
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
      assertRuleValidationError(message, "C007");
    }

    for (const message of ["feat: no scope", "feat(test): scope"]) {
      assertRuleNoValidationError(message, "C007");
    }
  });

  /**
   * [C008] The commit message's subject requires a separator (": ") after the type tag
   */
  test(`[C008] The commit message's subject requires a separator (": ") after the type tag`, () => {
    for (const message of [
      "feat missing seperator",
      "feat(test) missing seperator",
    ]) {
      assertRuleValidationError(message, "C008");
    }

    for (const message of [
      "feat: contains seperator",
      "feat!: breaking with seperator",
      "feat(scope): with scope",
      "feat(scope)!: with scope and breaking",
    ]) {
      assertRuleNoValidationError(message, "C008");
    }
  });

  /**
   * [C009] The commit message requires a description
   */
  test(`[C009] The commit message requires a description`, () => {
    for (const message of ["feat:", "feat: "]) {
      assertRuleValidationError(message, "C009");
    }

    for (const message of [
      "feat:description without whitespace",
      "feat: description with whitespace",
    ]) {
      assertRuleNoValidationError(message, "C009");
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
      assertRuleValidationError(message, "C010");
    }

    for (const message of [
      "feat!: breaking change",
      "feat(scope)!: breaking change",
      "feat(scope)!:breaking change",
    ]) {
      assertRuleNoValidationError(message, "C010");
    }
  });
});
