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
import * as core from "@actions/core";

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

  constructor({ major, minor, patch, prerelease = "", build = "", prefix = "" }: ISemVer) {
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
          throw new Error(`Provided build metadata (${buildMetadata}) does not comply to the SemVer specification`);
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
   * `prerelease` field, optionally overriding string before and
   * after said number.
   * `zeroPadToMinimum` can be provided to zero-pad the number in
   * the `prerelease` field to the specified minimum amount of digits.
   *
   * Returns new SemVer object or `null` if unsuccessful.
   */
  nextPrerelease(pre?: string, post?: string, zeroPadToMinimum?: number): SemVer | null {
    const match = /(?<pre>\D*)(?<nr>\d+)(?<post>.*)/.exec(this.prerelease);
    if (match == null || match.groups == null) {
      return null;
    }

    // We need to either keep the same amount of characters in the 'nr' group, or respect the provided
    // `zeroPadToMinimum`, so pad it with zeroes as needed.
    const incrementAndZeroPad = (inputNr: string): string => {
      const targetLength = Math.max(zeroPadToMinimum ?? 0, inputNr.length);
      let incremented = `${+inputNr + 1}`;
      while (incremented.length < targetLength) {
        incremented = `0${incremented}`;
      }
      return incremented;
    };

    const nv = SemVer.copy(this);
    nv.prerelease = `${pre ?? match.groups.pre}${incrementAndZeroPad(match.groups.nr)}${post ?? match.groups.post}`;
    nv.build = "";

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

  /**
   * Sort function for determining version precedence
   * Rules:
   *  'Full release' > '-rc*' > '-*' (every other prerelease)
   *  For version that have a prerelease field, the _first number encountered_
   *  shall be used to determine their precendence.
   *  If that number is found and is equal, the result shall be according to
   *  alphabetic comparison.
   *
   * returns a > b ? 1 : a < b ? -1 : 0
   */
  static sortSemVer(a: string | SemVer, b: string | SemVer): number {
    const lhs = typeof a === "string" ? SemVer.fromString(a) : a;
    const rhs = typeof b === "string" ? SemVer.fromString(b) : b;

    if (lhs === null || rhs === null) {
      return lhs === null && rhs !== null ? -1 : rhs === null && lhs !== null ? 1 : 0;
    }

    let allVersionFieldsEqual = false;
    if (lhs.major < rhs.major) return -1;
    if (lhs.major === rhs.major) {
      if (lhs.minor < rhs.minor) {
        return -1;
      }
      if (lhs.minor === rhs.minor) {
        if (lhs.patch < rhs.patch) {
          return -1;
        }
        if (lhs.patch === rhs.patch) {
          allVersionFieldsEqual = true;
        }
      }
    }
    if (!allVersionFieldsEqual) {
      return 1;
    }
    // At this stage, major, minor and patch are equal, so handle
    // prerelease

    let sortResult: number | undefined = undefined;
    const firstNum = /\D*(?<preversion>\d+)\D*.*/;
    const isRc = /^rc\d+\D*.*/;

    core.debug(`sort: ${rhs} and ${lhs}`);
    // First, handle all the precedence XORs
    if (!lhs.prerelease && rhs.prerelease) {
      sortResult = +1;
      core.debug(`sort: ${lhs} is rel, ${rhs} is not; +1`);
    } else if (lhs.prerelease && !rhs.prerelease) {
      sortResult = -1;
      core.debug(`sort: ${rhs} is rel, ${lhs} is not: -1`);
    } else if (isRc.test(lhs.prerelease) && !isRc.test(rhs.prerelease)) {
      sortResult = +1;
      core.debug(`sort: ${lhs} is rc, ${rhs} is not; +1`);
    } else if (!isRc.test(lhs.prerelease) && isRc.test(rhs.prerelease)) {
      sortResult = -1;
      core.debug(`sort: ${rhs} is rc, ${lhs} is not: -1`);
    } else {
      // Either both are releases, rc releases, or "other"
      if (lhs.prerelease && rhs.prerelease) {
        const l = +(firstNum.exec(lhs.prerelease)?.groups?.preversion ?? 0);
        const r = +(firstNum.exec(rhs.prerelease)?.groups?.preversion ?? 0);
        core.debug(`sort: ${rhs} is subver ${r}, ${lhs} is subver ${l}`);
        if (l === r) {
          sortResult = lhs.prerelease.localeCompare(rhs.prerelease);
        } else {
          sortResult = l === r ? 0 : l < r ? -1 : 1;
        }
      } else {
        sortResult = 0;
      }
    }
    core.debug(`sort: ${lhs} < ${rhs} = ${sortResult}`);
    return sortResult;
  }

  lessThan(rhs: SemVer): boolean {
    return SemVer.sortSemVer(this, rhs) === -1;
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
