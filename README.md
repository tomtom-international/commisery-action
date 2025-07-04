# Conventional Commit Messages

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
        run: echo "Version bumped to ${{steps.release-version.outputs.next-version}} (${{fromJSON(steps.release-version.outputs.bump-metadata).bump.type}})"
```
More info on the bump action and the available options [here](docs/github-action.md)

#### Outputs

| Name | Description |
| --- | --- |
| `next-version` | The next version (including any prefix), based on the commits since `current-version`, or an empty string if a version bump was not or could not be performed. |
| `bump-metadata` | Stringified JSON object containing the new version, associated tag and GitHub release and the release type associateed. Returns an empty string in case no bump was performed. |
| `current-version` | The version currently in the repository, or empty string if no SemVer-compatible tags were found (or none were found matching the version-prefix, if provided) |


Example `bump-metadata` output value:
 ```json
  {
    "bump": {
      "from": "0.7.1",
      "to": "1.0.0",
      "type": "rel"
    },
    "release": {
      "name": "1.0.0",
      "id": 1234567,
      "draft": false,
      "prerelease": false
    },
    "tag": {
      "ref": "refs/tags/1.0.0",
      "name": "1.0.0",
      "sha": "baaaadb0b"
    }
  }
```

## Command-line Interface
You can find more information on how to use the CLI on the [dedicated page](docs/cli.md)

[Conventional Commits]: https://www.conventionalcommits.org/en/v1.0.0/
[Commisery]: https://pypi.org/project/commisery/
