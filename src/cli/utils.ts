/*
 * SPDX-FileCopyrightText: 2022 TomTom <http://tomtom.com>
 * SPDX-License-Identifier: Apache-2.0
 */

import { simpleGit } from "simple-git";

let __ROOT_PATH: string | undefined = undefined;

/**
 * Determine the root path of the GIT project
 */
export async function getRootPath(): Promise<string> {
  if (__ROOT_PATH === undefined) {
    try {
      __ROOT_PATH = await simpleGit().revparse({ "--show-toplevel": null });
    } catch (GitError) {
      __ROOT_PATH = process.cwd();
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
export async function getCommitMessages(target: string[]): Promise<string[]> {
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

  const messages: string[] = [];
  for (const hash of commitHashes) {
    try {
      messages.push(await getCommitMessage(hash));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      continue;
    }
  }

  return messages;
}
