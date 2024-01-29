# Conventional Commit Messages
[![Download](https://img.shields.io/badge/Download-Linux%20x64-blue)](https://github.com/tomtom-international/commisery-action/releases/latest/download/commisery-linux-x64) [![Download](https://img.shields.io/badge/Download-MacOS%20arm64-blue)](https://github.com/tomtom-international/commisery-action/releases/latest/download/commisery-macos-arm64) [![Download](https://img.shields.io/badge/Download-MacOS%20x64-blue)](https://github.com/tomtom-international/commisery-action/releases/latest/download/commisery-macos-x64)

This GitHub Action consists of two major components:

- Scan all commits in your Pull Request against the [Conventional Commits] standard
- Create GitHub Releases based on unreleased [Conventional Commits]

It is possible to apply the following version scheme(s):
- [Semantic Versioning](docs/semantic-versioning.md)
- [SDK Versioning](docs/sdk-versioning.md)


## Usage
These are minimal examples; see the actions' [respective documentation](docs/github-action.md)
for more options and details.

### Configuration

The `commisery-action` supports a configuration file, allowing you to:
- Change which rules should be enabled for commit message validation
- Add additional [Conventional Commit](https://www.conventionalcommits.org/en/v1.0.0/) types
- Change the versioning strategy

Please refer to the [documentation](docs/configuration.md) for more details

### Conventional Commit message validation
The following example workflow will trigger on pull request creation/modification and verify
all associated commit messages.

```yaml
name: Commisery
on:
  pull_request:

jobs:
  commit-message:
    name: Conventional Commit compliance
    runs-on: ubuntu-latest

    steps:
      - name: Check for Conventional Commit compliance
        uses: tomtom-international/commisery-action@v2
        with:
          token: ${{ github.token }}
```
See [the documentation](docs/github-action.md) for more information and all possible options
for commit message validation.

### Bump
The following bumps the version according to the Conventional Commits between HEAD and the
latest SemVer tag (granted one is present).

```yaml
name: Bump version
on:
  push:
    branches: [ main ]

jobs:
  bump-version:
    name: Bump version and release
    runs-on: ubuntu-latest

    steps:
      - name: Release version
        id: release-version
        uses: tomtom-international/commisery-action/bump@v2
        with:
          token: ${{ github.token }}
          create-release: true              # OPTIONAL, default: `false`
          create-tag: false                 # OPTIONAL, default: `false`
      - run: echo "Current version is ${{steps.release-version.outputs.current-version}}"
      - if: steps.release-version.outputs.next-version != ''
        run: echo "Version bumped to ${{steps.release-version.outputs.next-version}}"
```
More info on the bump action and the available options [here](docs/github-action.md)

## Command-line Interface
You can find more information on how to use the CLI on the [dedicated page](docs/cli.md)

[Conventional Commits]: https://www.conventionalcommits.org/en/v1.0.0/
[Commisery]: https://pypi.org/project/commisery/
