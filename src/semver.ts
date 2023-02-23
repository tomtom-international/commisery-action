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

import { ISemVer } from "./interfaces";

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
    .map(r => r.source)
    .join("")
);

/**
 * SemVer version core types
 */
// eslint-disable-next-line no-shadow
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
  prefix: string;
  private _build!: string;

  constructor({
    major,
    minor,
    patch,
    prerelease = "",
    build = "",
    prefix = "",
  }: ISemVer) {
    this.major = major;
    this.minor = minor;
    this.patch = patch;
    this.prerelease = prerelease;
    this.build = build;
    this.prefix = prefix;
  }

  static copy(semver): SemVer {
    return new SemVer({
      build: semver.build,
      ...semver,
    });
  }

  get build(): string {
    return this._build;
  }

  set build(buildMetadata: string) {
    if (buildMetadata !== "") {
      for (const identifier of buildMetadata.split(".")) {
        if (/[^0-9A-Za-z-]/.test(identifier) || identifier.length === 0) {
          throw new Error(
            `Provided build metadata (${buildMetadata}) does not comply to the SemVer specification`
          );
        }
      }
    }
    this._build = buildMetadata;
  }

  static fromString(version: string): SemVer | null {
    const match = SEMVER_RE.exec(version);
    if (match != null && match.groups != null) {
      return new SemVer({
        major: +match.groups.major,
        minor: +match.groups.minor,
        patch: +match.groups.patch,
        prerelease: match.groups.prerelease || "",
        build: match.groups.build || "",
        prefix: match.groups.prefix || "",
      });
    }
    return null;
  }

  toString(): string {
    const prerelease = this.prerelease ? `-${this.prerelease}` : "";
    const build = this.build ? `+${this.build}` : "";

    return `${this.prefix}${this.major}.${this.minor}.${this.patch}${prerelease}${build}`;
  }

  nextMajor(): SemVer {
    return new SemVer({
      major: this.major + 1,
      minor: 0,
      patch: 0,
      prefix: this.prefix,
    });
  }

  nextMinor(): SemVer {
    return new SemVer({
      major: this.major,
      minor: this.minor + 1,
      patch: 0,
      prefix: this.prefix,
    });
  }

  nextPatch(): SemVer {
    if (this.prerelease !== "") {
      return new SemVer({
        major: this.major,
        minor: this.minor,
        patch: this.patch,
        prefix: this.prefix,
      });
    }
    return new SemVer({
      major: this.major,
      minor: this.minor,
      patch: this.patch + 1,
      prefix: this.prefix,
    });
  }

  /**
   * Attempts to increment the first number encountered in the
   * `prerelease` field.
   * Returns new SemVer object or `null` if unsuccessful.
   */
  nextPrerelease(): SemVer | null {
    const match = /(?<pre>\D*)(?<prereleaseVersion>\d+)(?<post>.*)/.exec(
      this.prerelease
    );
    if (match == null || match.groups == null) {
      return null;
    }

    const nv = SemVer.copy(this);
    nv.prerelease =
      `${match.groups.pre}` +
      `${+match.groups.prereleaseVersion + 1}${match.groups.post}`;

    return nv;
  }

  /**
   * Returns a new SemVer object bumped by the provided bump type, or `null` if the
   * provided type is NONE or unknown.
   */
  bump(what: SemVerType, initialDevelopment = true): SemVer | null {
    if (!initialDevelopment && this.major <= 0) {
      // Enforce version 1.0.0 in case we are no longer in initial
      // development and the current major version is 0.
      //
      // NOTE: this will enforce a version bump (also for non-bumping commits)
      return new SemVer({
        major: 1,
        minor: 0,
        patch: 0,
        prefix: this.prefix,
      });
    }

    switch (what) {
      case SemVerType.MAJOR:
        if (initialDevelopment && this.major <= 0) {
          // Bumping major version during initial development is prohibited,
          // bump the minor version instead.
          return this.nextMinor();
        }
        return this.nextMajor();
      case SemVerType.MINOR:
        return this.nextMinor();
      case SemVerType.PATCH:
        return this.nextPatch();
      default:
        return null;
    }
  }

  lessThan(rhs: SemVer): boolean {
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
          if (this.prerelease !== "" && rhs.prerelease === "") {
            return true;
          }
        }
      }
    }
    return false;
  }

  equals(rhs: SemVer): boolean {
    return (
      this.major === rhs.major &&
      this.minor === rhs.minor &&
      this.patch === rhs.patch &&
      !!this.prerelease === !!rhs.prerelease
    );
  }
}
