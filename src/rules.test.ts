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

  test("[C002] Only one empty line between subject and body", () => {
    for (const message of [
      dedent(`feat: check rule
        
        
        This is the body`),
      dedent(`feat: check rule
        
        
        Implements: 123`),
    ]) {
      assertRuleValidationError(message, "C002");
    }

    for (const message of [
      dedent(`feat: check rule
        
        This is the body`),
      dedent(`feat: check rule
        
        Implements: 123`),
    ]) {
      assertRuleNoValidationError(message, "C002");
    }
  });
});
