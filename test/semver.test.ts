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
import * as core from "@actions/core";

import { SemVer, SemVerType } from "../src/semver";

describe("Semantic Version parsing correct input", () => {
  test("Full", () => {
    expect(SemVer.fromString("some-prefix-1.2.3-4+5")).toStrictEqual(
      new SemVer({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: "4",
        build: "5",
        prefix: "some-prefix-",
      })
    );
  });
  test("No prefix", () => {
    expect(SemVer.fromString("1.2.3-4+5")).toStrictEqual(
      new SemVer({ major: 1, minor: 2, patch: 3, prerelease: "4", build: "5" })
    );
  });
  test("No prefix and build", () => {
    expect(SemVer.fromString("1.2.3-4")).toStrictEqual(
      new SemVer({ major: 1, minor: 2, patch: 3, prerelease: "4" })
    );
  });
  test("No prefix and prerelease", () => {
    expect(SemVer.fromString("1.2.3+5")).toStrictEqual(
      new SemVer({ major: 1, minor: 2, patch: 3, build: "5" })
    );
  });
  test("No prerelease and build", () => {
    expect(SemVer.fromString("v1.2.3")).toStrictEqual(
      new SemVer({ major: 1, minor: 2, patch: 3, prefix: "v" })
    );
  });
});

describe("Semantic Version lossless stringification", () => {
  test("All fields", () => {
    const input = "version1.2.3-5+678";
    expect(SemVer.fromString(input)?.toString()).toEqual(input);
  });
  test("Major, minor, patch", () => {
    const input = "1.2.3";
    expect(SemVer.fromString(input)?.toString()).toEqual(input);
  });
  test("Major, minor, patch, build", () => {
    const input = "1.2.3+5";
    expect(SemVer.fromString(input)?.toString()).toEqual(input);
  });
  test("Prefix, Major, minor, patch, prerelease", () => {
    const input = "version-1.2.3-prerelease";
    expect(SemVer.fromString(input)?.toString()).toEqual(input);
  });
});

describe("Semantic Version parsing incorrect input", () => {
  test("Random non-semantic version", () => {
    expect(SemVer.fromString("version_1-2-3")).toBeNull();
  });
  test("Invalid characters in prefix", () => {
    expect(SemVer.fromString("version_1.2.3-4")).toBeNull();
  });
  test("Only major and minor", () => {
    expect(SemVer.fromString("1.2-beta.1")).toBeNull();
  });
  test("Empty prerelease", () => {
    expect(SemVer.fromString("1.2.3-")).toBeNull();
  });
  test("Empty build", () => {
    expect(SemVer.fromString("1.2.3-1.2+")).toBeNull();
  });
  test("Empty prerelease and build", () => {
    expect(SemVer.fromString("1.2.3-+")).toBeNull();
  });
});

describe("Semantic Version bumping by type", () => {
  test("Bump major", () => {
    expect(SemVer.fromString("v1.2.3-4")?.bump(SemVerType.MAJOR)).toStrictEqual(
      new SemVer({ major: 2, minor: 0, patch: 0, prefix: "v" })
    );
  });
  test("Bump minor", () => {
    expect(SemVer.fromString("v1.2.3-4")?.bump(SemVerType.MINOR)).toStrictEqual(
      new SemVer({ major: 1, minor: 3, patch: 0, prefix: "v" })
    );
  });
  test("Bump patch on prerelease", () => {
    expect(SemVer.fromString("v1.2.3-4")?.bump(SemVerType.PATCH)).toStrictEqual(
      new SemVer({ major: 1, minor: 2, patch: 3, prefix: "v" })
    );
  });
  test("Bump patch", () => {
    expect(SemVer.fromString("v1.2.3")?.bump(SemVerType.PATCH)).toStrictEqual(
      new SemVer({ major: 1, minor: 2, patch: 4, prefix: "v" })
    );
  });
  test("No bump", () => {
    expect(SemVer.fromString("v1.2.3")?.bump(SemVerType.NONE)).toStrictEqual(
      null
    );
  });
});

describe("Semantic Version bumping by type (initial development)", () => {
  test("Bump major", () => {
    expect(SemVer.fromString("v0.2.3-4")?.bump(SemVerType.MAJOR)).toStrictEqual(
      new SemVer({ major: 0, minor: 3, patch: 0, prefix: "v" })
    );
  });
  test("Bump minor", () => {
    expect(SemVer.fromString("v0.2.3-4")?.bump(SemVerType.MINOR)).toStrictEqual(
      new SemVer({ major: 0, minor: 3, patch: 0, prefix: "v" })
    );
  });
  test("Bump patch on prerelease", () => {
    expect(SemVer.fromString("v0.2.3-4")?.bump(SemVerType.PATCH)).toStrictEqual(
      new SemVer({ major: 0, minor: 2, patch: 3, prefix: "v" })
    );
  });
  test("Bump patch", () => {
    expect(SemVer.fromString("v0.2.3")?.bump(SemVerType.PATCH)).toStrictEqual(
      new SemVer({ major: 0, minor: 2, patch: 4, prefix: "v" })
    );
  });
  test("No bump", () => {
    expect(SemVer.fromString("v0.2.3")?.bump(SemVerType.NONE)).toStrictEqual(
      null
    );
  });
});

describe("Semantic Version bumping by type (end of initial development)", () => {
  test("Bump major", () => {
    expect(
      SemVer.fromString("v0.2.3-4")?.bump(SemVerType.MAJOR, false)
    ).toStrictEqual(new SemVer({ major: 1, minor: 0, patch: 0, prefix: "v" }));
  });
  test("Bump minor", () => {
    expect(
      SemVer.fromString("v0.2.3-4")?.bump(SemVerType.MINOR, false)
    ).toStrictEqual(new SemVer({ major: 1, minor: 0, patch: 0, prefix: "v" }));
  });
  test("Bump patch on prerelease", () => {
    expect(
      SemVer.fromString("v0.2.3-4")?.bump(SemVerType.PATCH, false)
    ).toStrictEqual(new SemVer({ major: 1, minor: 0, patch: 0, prefix: "v" }));
  });
  test("Bump patch", () => {
    expect(
      SemVer.fromString("v0.2.3")?.bump(SemVerType.PATCH, false)
    ).toStrictEqual(new SemVer({ major: 1, minor: 0, patch: 0, prefix: "v" }));
  });
  test("No bump", () => {
    expect(
      SemVer.fromString("v0.2.3")?.bump(SemVerType.NONE, false)
    ).toStrictEqual(new SemVer({ major: 1, minor: 0, patch: 0, prefix: "v" }));
  });
});

describe("Semantic Version ordering", () => {
  test("Equality", () => {
    expect(
      SemVer.fromString("v1.2.3")?.equals(SemVer.fromString("v1.2.3")!)
    ).toBe(true);
  });
  test("Equality with different prefix", () => {
    expect(
      SemVer.fromString("prefix-one-1.2.3")?.equals(
        SemVer.fromString("prefix-two-1.2.3")!
      )
    ).toBe(true);
  });
  test("Minor less than major", () => {
    expect(
      SemVer.fromString("v1.3.3")?.lessThan(SemVer.fromString("v2.2.3")!)
    ).toBe(true);
  });
  test("Patch less than minor", () => {
    expect(
      SemVer.fromString("v1.2.4")?.lessThan(SemVer.fromString("v1.3.3")!)
    ).toBe(true);
  });
  test("Prerelease less than patch", () => {
    expect(
      SemVer.fromString("v1.2.3-4")?.lessThan(SemVer.fromString("v1.2.3")!)
    ).toBe(true);
  });
});

describe("Build metadata", () => {
  test("Missing build metadata", () => {
    expect(() => {
      new SemVer({ major: 1, minor: 2, patch: 3 });
    }).not.toThrow(Error);
  });
  test("Valid build metadata", () => {
    expect(() => {
      new SemVer({
        major: 1,
        minor: 2,
        patch: 3,
        build: "identifier-1.identifier-2",
      });
    }).not.toThrow(Error);
  });
  test("Invalid build metadata", () => {
    expect(() => {
      new SemVer({
        major: 1,
        minor: 2,
        patch: 3,
        build: "identifier-1.identifier-2&wrong",
      });
    }).toThrow(Error);
  });
  test("Empty identifier in build metadata", () => {
    expect(() => {
      new SemVer({
        major: 1,
        minor: 2,
        patch: 3,
        build: "identifier-1..identifier-2",
      });
    }).toThrow(Error);
  });
});

describe("Helper functions", () => {
  test("Copy", () => {
    const original = SemVer.fromString("prefix1.2.3-prerelease+build");
    const copy = SemVer.copy(original);

    expect(copy).not.toBe(original);
    expect(copy).toStrictEqual(original);
  });
});
