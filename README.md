# Conventional Commit Messages

This GitHub Action, based on [Commisery], consists of two major components:

- Scan all commits in your Pull Request against the [Conventional Commits] standard
- Create GitHub Releases based on unreleased [Conventional Commits]

## Prerequisites

* [Commisery] requires at least `Python>3.8`
* `pip` needs to be installed for this Python version 

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
        - uses: actions/setup-python@v3
          with:
            python-version: 3.8

        - name: Check for compliance
          uses: tomtom-international/commisery-action@v1
          with:
            token: ${{ github.token }}
            validate-pull-request: true # OPTIONAL, default: `true`
            validate-commits: true # OPTIONAL, default: `true`
```

### Inputs

| Item | Mandatory | Description |
| --- | --- | --- |
| `token` | YES |  GitHub Token provided by GitHub, see [Authenticating with the GITHUB_TOKEN] |
| `validate-pull-request` | NO | Includes the Pull Request title and description as part of the Conventional Commit validation (DEFAULT: `false`) |
| `validate-commits` | NO | Includes commits associated with the current Pull Request as part of the Conventional Commit validation (DEFAULT: `true`) |

> **NOTE**: This action will only function as part of the `pull_request` trigger for workflows.

### Example of Conventional Commit check results

![example](https://github.com/tomtom-international/commisery-action/raw/master/resources/example.png)

### Create GitHub Releases based on unreleased Conventional Commits

With the `/bump` GitHub Action, you can create a new release (and implicitly a Git tag), based on the
[Conventional Commits] since the latest tag, provided it is a [Semantic Versioning]-compatible tag.

Both the current and bumped versions are available as outputs, and an optional input can be provided to
disable automatic release creation, in case you're only interested in the new version.

An example workflow that creates a release on every commit or merge to the `main` branch:

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
        - uses: actions/checkout@v3
          with:
            # Make sure that you retrieve a depth large enough to cover your unreleased commits.
            fetch-depth: 0

        - uses: actions/setup-python@v3
          with:
            python-version: 3.8

        - name: Release version
          id: release-version
          uses: tomtom-international/commisery-action/bump@v1
          with:
            token: ${{ github.token }}
            create-release: true # OPTIONAL, default: `true`
            version-prefix: v # OPTIONAL

        - run: echo "Current version is ${{steps.release-version.outputs.current-version}}"

        - if: steps.release-version.outputs.next-version != ""
          run: echo "Version bumped to ${{steps.release-version.outputs.next-version}}
```

> **NOTE**: Make sure that enough history and tags must be available for the tag to be discoverable. This example uses a GitHub's "checkout" action with a fetch depth of zero (which imports the complete history).

### Inputs

| Item | Mandatory | Description |
| --- | --- | --- |
| `token` | YES | GitHub Token provided by GitHub, see [Authenticating with the GITHUB_TOKEN]|
| `create-release` | NO | Can optionally be set to `false` to disable release creation on version bump.|
| `version-prefix` | NO | An optional prefix to the Semantic Version, eg. `v`, `componentX-`. The value of this parameter will be prepended to the tagged version.
| `config` | NO | Location of the Commisery configuration file (default: `.commisery.yml`)

> **NOTE**: The `version-prefix` this is *not* used for determining the current version.

### Outputs
| Output | Description |
| --- | --- |
| `current-version` | The Semantic Version associated with the latest tag in the repository, stripped of any and all prefixes, or an empty string if the latest tag could not be parsed as a SemVer.
| `next-version` | The next version (including the optionally provided version-prefix) as determined from the Conventional Commits, or empty string if a version bump was not performed

## Additional configuration options

You can provide additional configuration parameters to Commisery by providing a 
configuration file. i.e.:

```yml
        - name: Check for compliance
          uses: tomtom-international/commisery-action@v1
          with:
            token: ${{ github.token }}
            config: '.commisery.yml' # OPTIONAL, default: `.commisery.yml`
```

This configuration file can be used to;
- Disable certain rules
- Add additional Conventional Commit types
- Increase the maximum subject length

Please refer to the [Commisery Documentation](https://github.com/tomtom-international/commisery/blob/master/README.md)
for more details about this configuration file.

[Conventional Commits]: https://www.conventionalcommits.org/en/v1.0.0/
[Semantic Versioning]: https://semver.org/spec/v2.0.0.html
[Commisery]: https://pypi.org/project/commisery/
[Authenticating with the GITHUB_TOKEN]: https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token


[Conventional Commits]: https://www.conventionalcommits.org/en/v1.0.0/
[Commisery]: https://pypi.org/project/commisery/
[Authenticating with the GITHUB_TOKEN]: https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token
[GitHub context]: https://docs.github.com/en/actions/reference/context-and-expression-syntax-for-github-actions#github-context
