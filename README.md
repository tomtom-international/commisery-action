<!--
Copyright (C) 2020-2022, TomTom (http://tomtom.com).

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

# Check your commits against Conventional Commits using Commisery

Using this GitHub action, scan your Pull Request title and all commits in your
Pull Request against the [Conventional Commits] standard using [Commisery]

## Usage

The workflow, usually declared in `.github/workflows/build.yml`, looks like:

```yaml
name: Conventional Commit Check
on:
  pull_request:
    types: [edited, opened, synchronize, reopened]

jobs:
  commit-message:
    name: Conventional Commit Message Checker (Commisery)
    runs-on: ubuntu-latest
    steps:
    - name: Run Commisery
      uses: tomtom-international/commisery-action@master
      with:
        token: ${{ secrets.GITHUB_TOKEN }}
        pull_request: ${{ github.event.number }}
```

### Inputs

- **token**: GitHub Token provided by GitHub, see [Authenticating with the GITHUB_TOKEN]
- **pull_request**: Pull Request number, provided by the [GitHub Context]


## Example of Conventional Commit check results

Below is an example of this actions output:

![Example](resources/example.png)

[Authenticating with the GITHUB_TOKEN]: https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token
[Conventional Commits]: https://www.conventionalcommits.org/en/v1.0.0/
[Commisery]: https://pypi.org/project/commisery/
[GitHub Context]: https://docs.github.com/en/actions/reference/context-and-expression-syntax-for-github-actions#github-context