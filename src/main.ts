/**
 * Copyright (C) 2020-2022, TomTom (http://tomtom.com).
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

 const core = require("@actions/core");
 const exec = require("@actions/exec");
 const github = require("@actions/github");
 const fs = require("fs");
 
 /**
  * Strips ANSI color codes from the provided message
  * @param message
  * @returns message without ANSI color codes
  */
 function strip_ansicolor(message: string) {
   const pattern = [
     "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
     "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))",
   ].join("|");
 
   return message.replace(new RegExp(pattern, "g"), "");
 }
 
 /**
  * Converts error message into GitHub accepted format
  * @param message
  * @returns multiline message
  */
 function get_error_subjects(message: string) {
   let errors: string[] = [];
 
   for (var line of strip_ansicolor(message).split("\n")) {
     if (line.startsWith(".commit-message") && (line.indexOf(": error:") > -1)) {
       errors.push(line);
     } else if (line.length > 0) {
       errors[errors.length - 1] += `\n${line}`;
     }
   }
 
   return errors;
 }
 
 /**
  * Confirms whether Python >=3.8 and pip are present on the runner
  */
 async function check_prerequisites() {
   const python_version_re = /Python\s*(\d+)\.(\d+)\.(\d+)/;
   const { stdout: python_version } = await exec.getExecOutput(
     "python3",
     ["--version"],
     { silent: true }
   );
   const match = python_version_re.exec(python_version);
 
   if (!match || match.length != 4) {
     throw new Error("Unable to determine the installed Python version.");
   }
 
   if (!(parseInt(match[1]) == 3 && parseInt(match[2]) >= 8)) {
     throw new Error(
       `Incorrect Python version installed; found ${match[1]}.${match[2]}.${match[3]}, expected >= 3.8.0`
     );
   }
 
   try {
     const { stdout: pip_version } = await exec.getExecOutput(
       "python3",
       ["-m", "pip", "--version"],
       { silent: true }
     );
   } catch {
     throw new Error("Unable to determine the installed Pip version.");
   }
 }
 
 /**
  * Installs the latest version of commisery
  */
 async function prepare_environment() {
   // Ensure Python (>= 3.8) and pip are installed
   await check_prerequisites();
 
   // Install latest version of commisery
   await exec.exec("python3", ["-m", "pip", "install", "--upgrade", "commisery"]);
 }
 
 /**
  * Retrieves a list of commits associated with the specified Pull Request
  * @param owner GitHub owner
  * @param repo GitHub repository
  * @param pullrequest_id GitHub Pullrequest ID
  * @returns List of commit objects
  */
 async function get_commits(
   owner: string,
   repo: string,
   pullrequest_id: string
 ) {
   const github_token = core.getInput("token");
   const octokit = github.getOctokit(github_token);
 
   // Retrieve commits from provided Pull Request
   const { data: commits } = await octokit.rest.pulls.listCommits({
     owner: owner,
     repo: repo,
     pull_number: pullrequest_id,
   });
 
   return commits;
 }
 
 /**
  * Validates the commit object against the Conventional Commit convention
  * @param commit
  * @returns
  */
 async function is_commit_valid(commit): Promise<[boolean, string[]]> {
   // Provide the commit message as file
   await fs.writeFileSync(".commit-message", commit.commit.message);
 
   let stderr = "";
 
   try {
     await exec.exec("commisery-verify-msg", [".commit-message"], {
       ignoreReturnCode: true,
       silent: true,
       listeners: {
         stderr: (data: Buffer): string => (stderr += data.toString()),
       },
     });
   } catch (error) {
     core.debug("Error detected while executing commisery");
   }
 
   return [stderr == "", get_error_subjects(stderr)];
 }
 
 async function run() {
   // Ensure that commisery is installed
   try {
     await prepare_environment();
 
     let [owner, repo] = (process.env.GITHUB_REPOSITORY || "").split("/");
 
     // Validate each commit against Conventional Commit standard
     let commits = await get_commits(owner, repo, core.getInput("pull_request"));
     let success = true;
 
     for (const commit of commits) {
       let [valid, errors] = await is_commit_valid(commit);
 
       if (!valid) {
         core.summary
           .addHeading(commit.commit.message, 2)
           .addRaw(
             `<b>SHA:</b> <a href="${commit.html_url}"><code>${commit.sha}</code></a>`
           );
 
         for (var error of errors) {
           core.summary.addCodeBlock(error);
         }
 
         success = false;
       }
     }
 
     if (!success) {
       core.setFailed(
         `Commits in your Pull Request are not compliant to Conventional Commits`
       );
 
       // Post summary
       core.summary.write();
     }
   } catch (ex) {
     core.setFailed((ex as Error).message);
   }
 }
 
 run();
 