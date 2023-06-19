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

import { ConventionalCommitMessage } from "./commit";
import { SemVer, SemVerType } from "./semver";
import { LlvmError } from "./logging"; // TODO: Move LlvmError to its own file

export interface IVersionBumpTypeAndMessages {
  /* The nearest SemVer tag found in the repository */
  foundVersion: SemVer | null;
  /* The bump required from the messages */
  requiredBump: SemVerType;
  /* The validation results of messages from the provided commitish up to
   * (but not including) the commit associated with the nearest SemVer tag */
  processedCommits: IValidationResult[];
  /* True when initialDevelopment mode is configured and active (i.e. the
   * major version is > 0. */
  initialDevelopment: boolean;
}

export interface IRuleConfigItem {
  description: string;
  enabled: boolean;
}

export interface ITypeTagConfigItem {
  description?: string;
  bump?: boolean;
}

export interface IConfigurationRules {
  [key: string]: ITypeTagConfigItem;
}

export interface IConfiguration {
  disable: string[];
  "max-subject-length": number;
  tags: IConfigurationRules;
  "allowed-branches": string;
}

export interface ISemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  prefix?: string;
  build?: string;
}

export interface IGitTag {
  name: string;
  commitSha: string;
}

export interface ICommit {
  message: string;
  sha: string;
  parents?: string[];
}

export interface IValidationResult {
  input: ICommit;
  message?: ConventionalCommitMessage;
  errors: LlvmError[];
}

export type ReleaseMode = "none" | "release" | "tag"; // keep values user-friendly
export type SdkVerBumpType = "dev" | "rc" | "rel";
