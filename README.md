# Conventional Commit Messages

This GitHub Action consists of two major components:

- Scan all commits in your Pull Request against the [Conventional Commits] standard
- Create GitHub Releases based on unreleased [Conventional Commits]

## Permissions

The following permissions need to be set in order to have full support of the Commisery Action:

| Permission | Level | Notes |
| --- | --- | --- |
| `pull-requests` | `read` | Needed for Pull Request validation and (optionally) when creating a GitHub Release |
| `contents` | `write`| Required in order to create tags and/or GitHub Releases |

## Check your Pull Request for Conventional Commit Compliance

The workflow, usually declared in `.github/workflows/conventional-commit.yml`, looks like:

```yml
name: Commisery
on:
  pull_request:

jobs:
  commit-message:
    name: Conventional Commit compliance
    runs-on: ubuntu-latest

    steps:
      - name: Check for compliance
        uses: tomtom-international/commisery-action@v2
        with:
          token: ${{ github.token }}
          validate-pull-request: true # OPTIONAL, default: `true`
          validate-commits: true # OPTIONAL, default: `true`
```

### Inputs

| Item | Mandatory | Description |
| --- | --- | --- |
| `token` | YES | GitHub Token provided by GitHub, see [Authenticating with the GITHUB_TOKEN] |
| `validate-pull-request` | NO | Includes the Pull Request title and description as part of the Conventional Commit validation (DEFAULT: `false`) |
| `validate-commits` | NO | Includes commits associated with the current Pull Request as part of the Conventional Commit validation (DEFAULT: `true`) |
| `config` | NO | Location of the Commisery configuration file (default: `.commisery.yml`)

> **NOTE**: This action will only function as part of the `pull_request` trigger for workflows.

### Example of Conventional Commit check results

![example](https://github.com/tomtom-international/commisery-action/raw/master/resources/example.png)

### Create GitHub Releases based on unreleased Conventional Commits

With the `/bump` GitHub Action, you can create a new Git tag or a GitHub release (also implicitly a Git tag),
based on the [Conventional Commits] since the latest found [Semantic Versioning]-compatible tag.

Both the current and bumped versions are available as outputs.
Optional inputs can be provided to enable automatic tag or release creation when a bump is performed.
When running from a pull request event, tag/release creation is forcibly disabled, but the outputs are
still available.

Filtering the tags is also possible, by providing a `version-prefix` input. If set, only tags matching
_exactly_ with the value of `version-prefix` shall be taken into account while determining and bumping versions.
As an example, for version tag `componentX-1.2.3`, the version prefix would be `componentX-`.

An example workflow that creates a release on every commit or merge to the `main` branch if necessary:

```yml
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
        uses: tomtom-international/commisery-action/bump@v1
        with:
          token: ${{ github.token }}
          create-release: true  # OPTIONAL, default: `false`
          create-tag: false  # OPTIONAL
          version-prefix: v  # OPTIONAL
          config: .commisery.yml # OPTIONAL

      - run: echo "Current version is ${{steps.release-version.outputs.current-version}}"

      - if: steps.release-version.outputs.next-version != ""
        run: echo "Version bumped to ${{steps.release-version.outputs.next-version}}
```

The GitHub release will be automatically populated with a changelog based on the released Conventional
Commit messages, for example:

![changelog](resources/changelog.png)

### Inputs

| Item | Mandatory | Description |
| --- | --- | --- |
| `token` | YES | GitHub Token provided by GitHub, see [Authenticating with the GITHUB_TOKEN]|
| `create-release` | NO | Can optionally be set to `true` to create a GitHub release on version bump.|
| `create-tag` | NO | Can optionally be set to `true` to create a lightweight Git tag on version bump.|
| `version-prefix` | NO | An optional prefix specifying the tags to consider, eg. `v`, `componentX-`.
| `config` | NO | Location of the Commisery configuration file (default: `.commisery.yml`)

> :bulb: Note that setting both `create-release` and `create-tag` to `true` is never needed, since a GitHub
release implicitly creates a Git tag.

### Outputs
| Output | Description |
| --- | --- |
| `current-version` | The Semantic Version associated with the latest tag in the repository, stripped of any and all prefixes, or an empty string if the latest tag could not be parsed as a SemVer.
| `next-version` | The next version (including the optionally provided version-prefix) as determined from the Conventional Commits, or empty string if a version bump was not performed

## Configuration parameters

You can configure `commisery-action` using a YAML-based configuration file, i.e.

```yaml
max-subject-length: 120
tags:
  docs: Documentation changes not part of the API
  example: Changes to example code in the repository
disable:
  - C001
  - C018
allowed-branches: "^ma(in|ster)$"
```

| Item | Default value |Description | 
| --- | --- | --- |
| `max-subject-length` | `80` | The maximum length of the subject of the commit message |
| `tags` | `fix`, `feat`, `build`, `chore`, `ci`, `docs`, `perf`, `refactor`, `revert`, `style`, `test`, `improvement` | Additional tags (including description). These tags will not result in a version bump.<br><br>**NOTE:** The tags `feat` and `fix` will automatically be provided |
| `disabled` | `None` | List of rules to disable as part of the checker |
| `allowed-branches` | `.*` | A regex specifying from which branch(es) releases and tags are allowed to be created |

> :bulb: By default `commisery-action` will search for the file `.commisery.yml`. 
You can specify a different file with the `config` input parameter.


[Conventional Commits]: https://www.conventionalcommits.org/en/v1.0.0/
[Commisery]: https://pypi.org/project/commisery/
[Authenticating with the GITHUB_TOKEN]: https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token
[GitHub context]: https://docs.github.com/en/actions/reference/context-and-expression-syntax-for-github-actions#github-context
