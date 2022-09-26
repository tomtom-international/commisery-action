import dedent from "dedent";

import { ConventionalCommitMessage, SemVerType } from "./commit";
import {
  ConventionalCommitError,
  FixupCommitError,
  MergeCommitError,
} from "./rules";

// Validate non-compliant Commit Messages
//
describe("Non-compliant Commit Messages", () => {
  test("Merge commit", () => {
    expect(() => {
      new ConventionalCommitMessage("Merge branch 'some-branch'");
    }).toThrow(MergeCommitError);
  });

  test("Fixup commit", () => {
    expect(() => {
      new ConventionalCommitMessage("fixup! feat: add new feature");
    }).toThrow(FixupCommitError);
  });

  test("Non-Conventional Commit message", () => {
    expect(() => {
      new ConventionalCommitMessage("silly commit message");
    }).toThrow(ConventionalCommitError);
  });
});

// Validation of the Breaking Change parameter of a Commit Message
//
describe("Breaking Change", () => {
  test("Using ! indicator on Feat", () => {
    const msg = new ConventionalCommitMessage("feat!: this is breaking");
    expect(msg.breaking_change).toBe(true);
  });

  test("Not using ! indicator on Feat", () => {
    const msg = new ConventionalCommitMessage("feat: this is NOT breaking");
    expect(msg.breaking_change).toBe(false);
  });

  test("Using ! indicator on Fix", () => {
    const msg = new ConventionalCommitMessage("fix!: this is breaking");
    expect(msg.breaking_change).toBe(true);
  });

  test("Not using ! indicator on Fix", () => {
    const msg = new ConventionalCommitMessage("fix: this is NOT breaking");
    expect(msg.breaking_change).toBe(false);
  });

  test("Using BREAKING-CHANGE footer, with body", () => {
    const msg = new ConventionalCommitMessage(
      dedent(`feat: this is breaking

This is a multiline
body!

BREAKING-CHANGE: Remove API x`)
    );
    expect(msg.breaking_change).toBe(true);
  });

  test("Using BREAKING CHANGE footer, with body", () => {
    const msg = new ConventionalCommitMessage(
      dedent(
        `fix: this is breaking

      This is a multiline
      body!

      BREAKING CHANGE: Remove API x`
      )
    );
    expect(msg.breaking_change).toBe(true);
  });

  test("Using BREAKING-CHANGE footer, without body", () => {
    const msg = new ConventionalCommitMessage(
      dedent(`feat: this is breaking
    
    BREAKING-CHANGE: Remove API x`)
    );
    expect(msg.breaking_change).toBe(true);
  });

  test("Using BREAKING CHANGE footer, without body", () => {
    const msg = new ConventionalCommitMessage(
      dedent(
        `fix: this is breaking
    
    BREAKING CHANGE: Remove API x`
      )
    );
    expect(msg.breaking_change).toBe(true);
  });
});

// Validation of the body of a Commit Message
//
describe("Body", () => {
  test("No body", () => {
    const msg = new ConventionalCommitMessage("fix: this commit has no body");
    expect(msg.body).toBe(null);
  });

  test("Single line body", () => {
    const msg = new ConventionalCommitMessage(
      dedent(`fix: this is a single line body
    
    This is the body`)
    );

    expect(msg.body).toBe("This is the body");
  });

  test("Multiline body", () => {
    const msg = new ConventionalCommitMessage(
      dedent(`fix: this is a multiline body
    
    This is the body!
    Consisting of multiple lines!`)
    );

    expect(msg.body).toBe("This is the body!\nConsisting of multiple lines!");
  });
});

// Validation of Bump-type
//
describe("Bump", () => {
  test("No Bump", () => {
    const msg = new ConventionalCommitMessage("chore: this will not bump");
    expect(msg.bump).toBe(SemVerType.NONE);
  });

  test("Bump Patch", () => {
    const msg = new ConventionalCommitMessage("fix: this will bump PATCH");
    expect(msg.bump).toBe(SemVerType.PATCH);
  });

  test("Bump Minor", () => {
    const msg = new ConventionalCommitMessage("feat: this will bump MINOR");
    expect(msg.bump).toBe(SemVerType.MINOR);
  });

  test("Bump Major (!)", () => {
    const msg = new ConventionalCommitMessage("chore!: this will bump MAJOR");
    expect(msg.bump).toBe(SemVerType.MAJOR);
  });

  test("Bump Major (BREAKING CHANGE)", () => {
    const msg = new ConventionalCommitMessage(
      dedent(`chore: this will bump MAJOR
    
    BREAKING CHANGE: As this is a breaking change!`)
    );
    expect(msg.bump).toBe(SemVerType.MAJOR);
  });

  test("Bump Major (BREAKING-CHANGE)", () => {
    const msg = new ConventionalCommitMessage(
      dedent(`chore: this will bump MAJOR
    
    BREAKING-CHANGE: As this is a breaking change!`)
    );
    expect(msg.bump).toBe(SemVerType.MAJOR);
  });
});

// Validation of the description in a Commit Message
//
describe("Description", () => {
  test("Simple description", () => {
    const msg = new ConventionalCommitMessage("chore: this is the description");
    expect(msg.description).toBe("this is the description");
  });
});

// Validation of the Footer element in a Commit Message
//
describe("Footer", () => {
  test("No Footers", () => {
    const msg = new ConventionalCommitMessage(
      dedent(
        `fix: this commit has no footers
      
      only a body!`
      )
    );
    expect(msg.footers.length).toBe(0);
  });

  test("Basic footer", () => {
    const msg = new ConventionalCommitMessage(
      dedent(`fix: this commit has footers
      
      this is the body
      
      Implements: TEST-123`)
    );
    expect(msg.footers.length).toBe(1);
    expect(msg.footers[0].token).toBe("Implements");
    expect(msg.footers[0].value).toBe("TEST-123");
  });

  test("Discarded footer element due to paragraph break", () => {
    const msg = new ConventionalCommitMessage(
      dedent(`fix: this commit has footers
      
      Ignored: Item
      
      Implements: TEST-123`)
    );
    expect(msg.footers.length).toBe(1);
    expect(msg.footers[0].token).toBe("Implements");
    expect(msg.footers[0].value).toBe("TEST-123");
  });

  test("Line break allowed after BREAKING-CHANGE", () => {
    const msg = new ConventionalCommitMessage(
      dedent(`fix: this commit has footers
      
      BREAKING-CHANGE: This change is breaking

      Implements: TEST-123`)
    );
    expect(msg.footers.length).toBe(2);
    expect(msg.footers[0].token).toBe("BREAKING-CHANGE");
    expect(msg.footers[0].value).toBe("This change is breaking");
    expect(msg.footers[1].token).toBe("Implements");
    expect(msg.footers[1].value).toBe("TEST-123");
  });

  test("Multiline footer element", () => {
    const msg = new ConventionalCommitMessage(
      dedent(`chore: this contains a multiline footer element
    
    BREAKING-CHANGE: This is a multiline
     paragraph in the footer`)
    );

    expect(msg.footers.length).toBe(1);
    expect(msg.footers[0].token).toBe("BREAKING-CHANGE");
    expect(msg.footers[0].value).toBe(
      "This is a multiline\n paragraph in the footer"
    );
  });
});

// Validation of the scope in a Commit Message
//
describe("Scope", () => {
  test("No Scope", () => {
    const msg = new ConventionalCommitMessage("chore: commit without scope");
    expect(msg.scope).toBe(null);
  });

  test("Scope", () => {
    const msg = new ConventionalCommitMessage(
      "chore(test): commit without scope"
    );
    expect(msg.scope).toBe("test");
  });
});

// Validation of the type in a Commit Message
//
describe("Type", () => {
  test("Chore Commit", () => {
    const msg = new ConventionalCommitMessage("chore: did somethig");
    expect(msg.type).toBe("chore");
  });

  test("Feat Commit", () => {
    const msg = new ConventionalCommitMessage("feat(test): commit with scope");
    expect(msg.type).toBe("feat");
  });

  test("Fix Commit", () => {
    const msg = new ConventionalCommitMessage("fix!: breaking change");
    expect(msg.type).toBe("fix");
  });
});
