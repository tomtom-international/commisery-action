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

const SEMVER_RE = new RegExp(
  [
    /^(?<prefix>[A-Za-z-]+)?/,
    /(?<major>0|[1-9][0-9]*)/,
    /\.(?<minor>0|[1-9][0-9]*)/,
    /\.(?<patch>0|[1-9][0-9]*)/,
    /(?:-(?<prerelease>[-0-9a-zA-Z]+(?:\.[-0-9a-zA-Z]+)*))?/,
    /(?:\+(?<build>[-0-9a-zA-Z]+(?:\.[-0-9a-zA-Z]+)*))?/,
    /\s*$/,
  ]
    .map((r) => r.source)
    .join("")
);

/**
 * SemVer version core types
 */
export enum SemVerType {
  NONE = 0,
  PATCH = 1,
  MINOR = 2,
  MAJOR = 3,
}

export class SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
  build: string;
  prefix: string;

  constructor(
    major: number,
    minor: number,
    patch: number,
    prerelease: string,
    build: string,
    prefix: string
  ) {
    this.major = major;
    this.minor = minor;
    this.patch = patch;
    this.prerelease = prerelease;
    this.build = build;
    this.prefix = prefix;
  }

  public static from_string(version: string): SemVer | null {
    const match = SEMVER_RE.exec(version);
    if (match != null && match.groups != null) {
      return new SemVer(
        +match.groups.major,
        +match.groups.minor,
        +match.groups.patch,
        match.groups.prerelease || "",
        match.groups.build || "",
        match.groups.prefix || ""
      );
    }
    return null;
  }

  public to_string(): string {
    let prerelease = this.prerelease ? `-${this.prerelease}` : "";
    let build = this.build ? `+${this.build}` : "";

    return `${this.prefix}${this.major}.${this.minor}.${this.patch}${prerelease}${build}`;
  }

  public next_major(): SemVer {
    return new SemVer(this.major + 1, 0, 0, "", "", this.prefix);
  }

  public next_minor(): SemVer {
    return new SemVer(this.major, this.minor + 1, 0, "", "", this.prefix);
  }

  public next_patch(): SemVer {
    if (this.prerelease !== "") {
      return new SemVer(
        this.major,
        this.minor,
        this.patch,
        "",
        "",
        this.prefix
      );
    }
    return new SemVer(
      this.major,
      this.minor,
      this.patch + 1,
      "",
      "",
      this.prefix
    );
  }

  /**
   * Returns a new SemVer object bumped by the provided bump type, or `null` if the
   * provided type is NONE or unknown.
   */
  public bump(what: SemVerType): SemVer | null {
    switch (what) {
      case SemVerType.MAJOR:
        return this.next_major();
      case SemVerType.MINOR:
        return this.next_minor();
      case SemVerType.PATCH:
        return this.next_patch();
      default:
        return null;
    }
  }

  public lessThan(rhs: SemVer) {
    if (this.major < rhs.major) return true;
    if (this.major === rhs.major) {
      if (this.minor < rhs.minor) {
        return true;
      }
      if (this.minor === rhs.minor) {
        if (this.patch < rhs.patch) {
          return true;
        }
        if (this.patch === rhs.patch) {
          // only prerelease presence is currently evaluated;
          // TODO: commit distance-prerelease would be nice to have
          if (this.prerelease === "" && rhs.prerelease !== "") {
            return true;
          }
        }
      }
    }
    return false;
  }

  public equals(rhs: SemVer) {
    return (
      this.major === rhs.major &&
      this.minor === rhs.minor &&
      this.patch === rhs.patch &&
      !!this.prerelease === !!rhs.prerelease
    );
  }
}

module.exports = { SemVer, SemVerType };
