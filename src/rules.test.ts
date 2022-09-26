import dedent from "dedent";

import { ConventionalCommitMessage, SemVerType } from "./commit";
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
    ]) {
      assertRuleValidationError(message, "C004");
    }

    for (const message of ["feat: type exists", "fix: type exists"]) {
      assertRuleNoValidationError(message, "C004");
    }
  });
});
