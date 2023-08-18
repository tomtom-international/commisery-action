/*
 * SPDX-FileCopyrightText: 2023 TomTom <http://tomtom.com>
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from "crypto";
import { RequestError } from "@octokit/request-error";

export const toICommit = msg => ({
  message: msg,
  sha: createHash("sha1").update(msg).digest("hex").substring(0, 20),
});
export const PATCH_MSG = toICommit("fix: something");
export const MINOR_MSG = toICommit("feat: add something");
export const MAJOR_MSG = toICommit("chore!: make and break something");
export const MAJOR_MSG_FOOTER = toICommit(
  "fix: break\n\nBREAKING-CHANGE: something"
);
export const NONE_MSG1 = toICommit("perf: make something faster");
export const NONE_MSG2 = toICommit(
  "refactor: make something easier to maintain"
);
export const NONE_MSG3 = toICommit("build: make something more efficiently");
export const PRTITLE = type_ => `${type_}: simple PR title`;

export const INITIAL_VERSION = "1.2.3";
export const PATCH_BUMPED_VERSION = "1.2.4";
export const MINOR_BUMPED_VERSION = "1.3.0";
export const MAJOR_BUMPED_VERSION = "2.0.0";
export const HEAD_SHA = "baaaadb0b";
export const HEAD_SHA_ABBREV_8 = HEAD_SHA.substring(0, 8);
export const BASE_COMMIT = { message: "chore: base commit", sha: "f00dcafe" };

export const CHANGELOG_PLACEHOLDER = "CHANGELOG_PLACEHOLDER";

export const DEFAULT_COMMIT_LIST = [
  NONE_MSG1,
  NONE_MSG2,
  NONE_MSG3,
  BASE_COMMIT, // order matters; newest first, base last
];

export const mockGetInput = (setting, options?) => {
  switch (setting) {
    case "version-prefix":
      return "*";
    case "config":
      return ".commisery.yml";
    case "build-metadata":
      return "";
    case "release-type":
      return "";
  }
  throw new Error(`getInput("${setting}") not mocked`);
};

export const mockGetBooleanInput = (setting, options?) => {
  switch (setting) {
    case "create-release":
      return true;
    case "create-tag":
      return false;
    case "create-changelog":
      return true;
  }
  expect("error").toBe(`getBooleanInput("${setting}") not mocked`);
  return false;
};
export const getMockRequestError = statusCode =>
  new RequestError("Mocked Error", statusCode, {
    request: {
      method: "GET",
      url: "https://example.com",
      headers: { header: "" },
    },
    response: {
      status: statusCode,
      url: "",
      data: "",
      headers: { header: "" },
    },
  });
