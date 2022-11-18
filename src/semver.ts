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

  get build(): string {
    return this._build;
  }

  set build(build_metadata: string) {
    if (build_metadata !== "") {
      for (const identifier of build_metadata.split(".")) {
        if (/[^0-9A-Za-z-]/.test(identifier) || identifier.length === 0) {
          throw new Error(
            `Provided build metadata (${build_metadata}) does not comply to the SemVer specification`
          );
        }
      }
    }
    this._build = build_metadata;
  }

  static from_string(version: string): SemVer | null {
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

  to_string(): string {
    const prerelease = this.prerelease ? `-${this.prerelease}` : "";
    const build = this.build ? `+${this.build}` : "";

    return `${this.prefix}${this.major}.${this.minor}.${this.patch}${prerelease}${build}`;
  }

  next_major(): SemVer {
    return new SemVer({
      major: this.major + 1,
      minor: 0,
      patch: 0,
      prefix: this.prefix,
    });
  }

  next_minor(): SemVer {
    return new SemVer({
      major: this.major,
      minor: this.minor + 1,
      patch: 0,
      prefix: this.prefix,
    });
  }

  next_patch(): SemVer {
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
   * Returns a new SemVer object bumped by the provided bump type, or `null` if the
   * provided type is NONE or unknown.
   */
  bump(what: SemVerType, initial_development = true): SemVer | null {
    if (!initial_development && this.major <= 0) {
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
        if (initial_development && this.major <= 0) {
          // Bumping major version during initial development is prohibited,
          // bump the minor version instead.
          return this.next_minor();
        }
        return this.next_major();
      case SemVerType.MINOR:
        return this.next_minor();
      case SemVerType.PATCH:
        return this.next_patch();
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
