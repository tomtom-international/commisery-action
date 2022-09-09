# Create a new versioned GitHub release

This GitHub action will (by default) create a new release (and implicitly a Git tag), based on the
[Conventional Commits] since the latest tag, provided it is a [Semantic Versioning]-compatible tag.

Both the current and bumped versions are available as outputs, and an optional input can be provided to
disable automatic release creation, in case you're only interested in the new version.

## Prerequisites

* [Commisery] requires at least `Python>3.8`
* `pip` needs to be installed for this Python version

## Usage

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
            fetch-depth: 0

        - name: Set-up Python 3.8
          uses: actions/setup-python@v3
          with:
            python-version: 3.8

        - name: Bump version
          id: my-bump-step
          uses: tomtom-international/commisery-action/bump@master
          with:
            token: ${{ github.token }}
            create-release: true
            version-prefix: v

        - name: Example output usage
          run: |
            if [ -z "${{steps.my-bump-step.outputs.next-version}}" ]; then
              echo "Version was not bumped, current version is " \
                   "${{steps.my-bump-step.outputs.current-version}}"
            else
              echo "Version bumped from ${{steps.my-bump-step.outputs.current-version}} " \
                   "to ${{steps.my-bump-step.outputs.next-version}}"
            fi
```

Note that enough history and tags must be available for the tag to be discoverable. This example uses a GitHub's "checkout" action with a fetch depth of zero (which imports the complete history).

## Inputs

- **token**: GitHub Token provided by GitHub, see [Authenticating with the GITHUB_TOKEN]
- **create-release**: Can optionally be set to "false" to disable release creation on version bump.
- **version-prefix**: An optional prefix to the Semantic Version, eg. "v", "componentX-".
                      The value of this parameter will be prepended to the tagged version.
                      Note that this is *not* used for determining the current version.

## Outputs
- **current-version**: The Semantic Version associated with the latest tag in the repository, stripped of any
                       and all prefixes, or an empty string if the latest tag could not be parsed as a SemVer.
- **next-version**: The next version (including the optionally provided version-prefix) as determined from the Conventional Commits,
                      or empty string if a version bump was not performed

[Conventional Commits]: https://www.conventionalcommits.org/en/v1.0.0/
[Semantic Versioning]: https://semver.org/spec/v2.0.0.html
[Commisery]: https://pypi.org/project/commisery/
[Authenticating with the GITHUB_TOKEN]: https://help.github.com/en/actions/automating-your-workflow-with-github-actions/authenticating-with-the-github_token
