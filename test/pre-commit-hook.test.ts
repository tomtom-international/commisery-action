/**
 * Copyright (C) 2026, TomTom (http://tomtom.com).
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

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as yaml from "yaml";

const root = path.join(__dirname, "..");

// Runs the `commisery` hook from .pre-commit-hooks.yaml the way pre-commit
// does: `entry`, followed by the path of the commit message file, with the
// executable resolved through the package's `bin`.
function runHook(message: string): ReturnType<typeof spawnSync> {
  const hooks = yaml.parse(
    fs.readFileSync(path.join(root, ".pre-commit-hooks.yaml"), "utf8")
  );
  const hook = hooks.find((h: { id: string }) => h.id === "commisery");
  const pkg = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  );

  // pre-commit splits `entry` with shlex; a whitespace split is equivalent
  // for an entry without quoting.
  const [executable, ...args] = hook.entry.split(/\s+/);

  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "commisery-hook-"));
  try {
    const messageFile = path.join(cwd, "COMMIT_EDITMSG");
    fs.writeFileSync(messageFile, message);

    return spawnSync(
      process.execPath,
      [path.join(root, pkg.bin[executable]), ...args, messageFile],
      { cwd, encoding: "utf8" }
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

describe("pre-commit hook", () => {
  test("Accepts a compliant commit message", () => {
    const result = runHook("feat: add a thing\n");

    expect(result.stderr).not.toContain("unknown command");
    expect(result.status).toBe(0);
  });
});
