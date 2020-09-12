#!/usr/bin/env python3

# Copyright (C) 2020-2020, TomTom (http://tomtom.com).
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

import click

from github import Github
from commisery import checking


@click.command()
@click.option('-t', '--token', required=True, help='GitHub Token')
@click.option('-r', '--repository', required=True,  help='GitHub repository')
@click.option('-p', '--pull-request-id', required=True, help='Pull Request identifier')
def main(token: str, repository: str, pull_request_id: int) -> int:
    repo = Github(token).get_repo(repository)
    commits = repo.get_pull(int(pull_request_id)).get_commits()

    for commit in commits:
        checking.main(argv=[1, commit.sha])


if __name__ == '__main__':
    main()
