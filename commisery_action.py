#!/usr/bin/env python3

# Copyright (C) 2020-2022, TomTom (http://tomtom.com).
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Commisery Action"""

import os
import re
import subprocess
import sys

import click

from github import Github


def convert_to_multiline(text: str) -> str:
    """Converts string to multiline GitHub message"""

    return text.replace(os.linesep, "%0A")


def strip_ansicolors(text: str) -> str:
    """Strip all ANSIC codes from string"""

    return re.sub("\x1b\\[(K|.*?m)", "", text)


def error_message(message: str):
    """Reports and error according to GitHub Workflow command syntax"""

    message = strip_ansicolors(convert_to_multiline(message))
    print(f"::error::{message}")


def message_to_file(message: str) -> str:
    """Converts commit message to file"""

    filename = "commit_message"

    with open(filename, "w+", encoding="UTF-8") as file_obj:
        file_obj.write(message)

    return filename


def check_message(message: str) -> bool:
    """Uses commisery to verify the commit message for compliance"""

    with subprocess.Popen(
        ["commisery-verify-msg", message_to_file(message)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    ) as proc:
        _, stderr = proc.communicate()

    if proc.returncode > 0:
        error_message(stderr.decode("utf-8"))
        return False

    return True


@click.command()
@click.option("-t", "--token", required=True, help="GitHub Token")
@click.option("-r", "--repository", required=True, help="GitHub Repository")
@click.option(
    "-p",
    "--pull-request-id",
    required=True,
    help="Pull Request identifier",
)
def main(token: str, repository: str, pull_request_id: int) -> int:
    """Command Line Interface"""

    errors = 0

    repo = Github(token).get_repo(repository)
    pullrequest = repo.get_pull(int(pull_request_id))

    if not check_message(pullrequest.title):
        errors += 1

    commits = pullrequest.get_commits()

    for commit in commits:
        if not check_message(commit.commit.message):
            errors += 1

    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()  # pylint: disable=E1120
