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

import { GitError, simpleGit } from "simple-git";
import { ConventionalCommitMessage } from "../commit";
import * as Color from "./colors";
import * as os from "os";
import dedent from "dedent";
import { SemVerType } from "../semver";

let __ROOT_PATH: string | undefined = undefined;

/**
 * Determine the root path of the GIT project
 */
export async function getRootPath(): Promise<string> {
  if (__ROOT_PATH === undefined) {
    try {
      __ROOT_PATH = await simpleGit().revparse({ "--show-toplevel": null });
    } catch (error: unknown) {
      if (error instanceof GitError) {
        __ROOT_PATH = process.cwd();
      } else {
        throw error;
      }
    }
  }

  return __ROOT_PATH;
}

/**
 * Determines a list of commit hashes (based on `git rev-parse`) using the
 * provided target
 */
async function getCommitHashes(target: string[]): Promise<string[]> {
  return (await simpleGit(await getRootPath()).revparse(target)).split("\n");
}

/**
 * Retrieve the full commit message for the provided target
 */
async function getCommitMessage(target: string): Promise<string> {
  return await simpleGit(await getRootPath()).show([
    "-q",
    "--format=%B",
    target,
    "--",
  ]);
}

/**
 * Retrieves a list of commit messages based on the provided target
 * parameter
 */
export async function getCommitMessages(
  target: string[]
): Promise<{ sha: string; body: string }[]> {
  const git = simpleGit(await getRootPath());
  let commitHashes: string[] = [];

  if (
    /^[0-9a-fA-F]{40}$/.test(target.join(" ")) === false &&
    (await getCommitHashes(target)).length > 1
  ) {
    commitHashes = (
      await git.raw(["rev-list"].concat(target).concat(["--"]))
    ).split("\n");
  } else {
    commitHashes.push(target[0]);
  }

  const messages: { sha: string; body: string }[] = [];
  for (const hash of commitHashes) {
    try {
      messages.push({ sha: hash, body: await getCommitMessage(hash) });
    } catch (error: unknown) {
      continue;
    }
  }

  return messages;
}

export function prettyPrintCommitMessage(
  commit: ConventionalCommitMessage
): void {
  console.log("");
  console.log(
    dedent(`
    ${Color.RED(`[[---- (Commit ${commit.hexsha}) ----]]`)}
    ${Color.GREEN("Type")}: ${commit.type}
    ${Color.GREEN("Scope")}: ${commit.scope ?? "None"}
    ${Color.GREEN("Breaking Change")}: ${
      commit.breakingChange ? Color.RED("Yes") : Color.GREEN("No")
    }
    ${Color.GREEN("Bump")}: ${SemVerType[commit.bump]}
    ${Color.GREEN("Description")}: ${commit.description}
    ${Color.GREEN("Body")}: ${Color.GRAY(commit.body ?? "None")}
    ${Color.GREEN("Footers")}:
    ${commit.footers
      .map(footer => `${footer.token}: ${Color.GRAY(footer.value)}`)
      .join(os.EOL)}
    `)
  );
}
