# GitHub Actions integration

## Permissions

The following permissions are needed for full support of `commisery-action`:

| Permission | Level | Notes |
| --- | --- | --- |
| `pull-requests` | `write` | Needed for Pull Request validation and (optionally) when creating a GitHub release |
| `contents` | `write`| Required in order to create tags and/or GitHub releases |
| `issues` | `write` | Required to add labels to the associated Pull Request and/or issue |

> :bulb: You can lower the permissions (`pull-requests: read` and `issues: none`) in case you do not
require support for Issue/Pull Request labels.

Please refer to the GitHub documentation for the
[default permissions for your GitHub Token](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)

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

### Issue Labels

The `commisery-action` will manage an issue label indicating the highest SemVer
version which will be bumped by its [release workflow](#create-github-releases-based-on-unreleased-conventional-commits):

| SemVer version | Issue Label |
| --- | --- |
| Major | `bump:major` |
| Minor | `bump:minor` |
| Patch | `bump:patch` |

> :warning: the action will replace *all* labels prefixed with `bump:` upon
running the validation step.

The label `initial development` is added to your pull request in case your project is still under [initial development](#initial-development)

See [permissions](#permissions) for more details on the required GitHub token permissions.

### Inputs

| Item | Mandatory | Description |
| --- | --- | --- |
| `token` | YES | GitHub Token provided by GitHub, see [Authenticating with the GITHUB_TOKEN] |
| `validate-pull-request` | NO | Includes the Pull Request title and description as part of the [Conventional Commit] validation (DEFAULT: `true`) |
| `validate-pull-request-title-bump` | NO | Ensures that the Pull Request title's version bump level matches that of its commits (implies `validate-pull-request`) (DEFAULT: `true`) |
| `validate-commits` | NO | Includes commits associated with the current Pull Request as part of the [Conventional Commit] validation (DEFAULT: `true`) |
| `config` | NO | Location of the Commisery configuration file (default: `.commisery.yml`)

> **NOTE**: This action will only function as part of the `pull_request` trigger for workflows.

### Example of Conventional Commit check results

![example](https://github.com/tomtom-international/commisery-action/raw/master/resources/example.png)

## Create GitHub Releases based on unreleased Conventional Commits

With the `/bump` GitHub Action, you can create a new Git tag or a GitHub release (also implicitly a Git tag),
based on the types of [Conventional Commits] since the latest found [Semantic Versioning]-compatible tag.
Breaking changes bump `MAJOR`, `feat`s bump `MINOR`, and `fix`es bump `PATCH`.
You may also specify additional types that bump `PATCH` using the [`tags.<tag>.bump`](#configuration-parameters)
configuration item.

Both the current and bumped versions are available as outputs.
Optional inputs can be provided to enable automatic tag or release creation when a bump is performed.
When running from a pull request event, tag/release creation is forcibly disabled, but the outputs are
still available.

Filtering the Git version tags is also possible, by providing a `version-prefix` input. If set, only tags matching
_exactly_ with the value of `version-prefix` shall be taken into account while determining and bumping versions.
As an example, for version tag `componentX-1.2.3`, the version prefix would be `componentX-`.

Since GitHub CI may append a reference to the PR number in merge/squash commits (depending on the settings),
certain rules (e.g. subject length), are disabled when processing commit messages while determining the next version.

### Initial Development

During initial development, you should avoid bumping the `MAJOR` version.
By default, we will bump the `MINOR` version for breaking changes in case:
- The current `MAJOR`-version is `0`
- **AND** the `initial-development` configuration parameter is `true` (default value)

We will automatically bump the version to `1.0.0` when:
- The current `MAJOR`-version is `0`
- **AND** the `initial-development` configuration parameter is `false`

> NOTE: This behavior also applies to non-bumping commits (ie. `chore:`, `ci:`)

### GitHub Release Changelog
The GitHub releases will be automatically populated with a changelog based on the released Conventional
Commit messages, for example:

![changelog](../resources/changelog.png)

You can configure the contents of your changelog using the `release.y[a]ml` configuration file stored in the `.github/` folder. For example:
```yaml
changelog:
  group: "scope" # OPTIONAL; allows grouping by Conventional Commit scope
  exclude:
    labels:
      - dependencies
  categories:
    - title: ⚠️ Breaking Changes
      labels:
        - bump:major
    - title: 🚀 New Features
      labels:
        - bump:minor
    - title: 🐛 Bug Fixes
      labels:
        - bump:patch
    - title: 📃 Documentation
      labels:
        - type:docs
    - title: 🚧 Other changes
      labels:
        - "*"
```

During generation, each [Conventional Commit] will be associated with the following labels:

| Label | Description |
| --- | --- |
| `bump:<version>` | The SemVer version to be bumped by this individual commit     |
| `type:<type>`    | [Conventional Commit] type associated with this commit message  |
| `scope:<scope>`  | [Conventional Commit] scope associated with this commit message |

> **NOTE**: The `bump:<version>`, `type:<type>` and `scope:<scope>` labels set on your Pull Request will be
ignored in favor of individual commits

Please refer to the ["Automatically generated release notes"](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes#configuring-automatically-generated-release-notes) documentation for more details

### Example workflow
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
          create-release: true              # OPTIONAL, default: `false`
          create-tag: false                 # OPTIONAL
          build-metadata: upstream-10.0.10  # OPTIONAL
          version-prefix: v                 # OPTIONAL
          config: .commisery.yml            # OPTIONAL

      - run: echo "Current version is ${{steps.release-version.outputs.current-version}}"

      - if: steps.release-version.outputs.next-version != ""
        run: echo "Version bumped to ${{steps.release-version.outputs.next-version}}
```

### Inputs

| Item | Mandatory | Description |
| --- | --- | --- |
| `token` | YES | GitHub Token provided by GitHub, see [Authenticating with the GITHUB_TOKEN]|
| `create-release` | NO | Can optionally be set to `true` to create a GitHub release on version bump.|
| `create-tag` | NO | Can optionally be set to `true` to create a lightweight Git tag on version bump.|
| `build-metadata` | NO | Build metadata to add to the SemVer version on version bump.|
| `version-prefix` | NO | An optional prefix specifying the tags to consider, eg. `v`, `componentX-`, `""`.|
| `config` | NO | Location of the Commisery configuration file (default: `.commisery.yml`)|

> :bulb: Note that setting both `create-release` and `create-tag` to `true` is never needed, since a GitHub
release implicitly creates a Git tag.

### Outputs
| Output | Description |
| --- | --- |
| `current-version` | The Semantic Version associated with the latest tag in the repository, stripped of any and all prefixes, or an empty string if the latest tag could not be parsed as a SemVer.
| `next-version` | The next version (including the optionally provided version-prefix) as determined from the [Conventional Commits], or empty string if a version bump was not performed

[Authenticating with the GITHUB_TOKEN]: https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token
[GitHub context]: https://docs.github.com/en/actions/reference/context-and-expression-syntax-for-github-actions#github-context

[Conventional Commits]: https://www.conventionalcommits.org/en/v1.0.0/
[Conventional Commit]: https://www.conventionalcommits.org/en/v1.0.0/