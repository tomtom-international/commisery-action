# Command Line Interface

A stand-alone CLI tool is provided as part of the `commisery-action` package.

## Compliance Check

You can use the `check` command to validate your commit messages for compliance with [Conventional Commits]:

```sh
Usage: commisery check [options] [TARGET...]

Checks whether commit messages adhere to the Conventional Commits standard.

Arguments:
  TARGET         The `TARGET` can be:
    - a single commit hash
    - a file containing the commit message to check
    - a revision range that `git rev-list` can interpret
   When TARGET is omitted, 'HEAD' is implied.

Options:
  -v, --verbose  also print commit message metadata (default: false)
  -h, --help     display help for command
```

> :bulb: flag will provide an overview of the parsed Conventional Commits elements for each correct message encountered.
> This can be valuable to investigate scenarios in which you expected a different version bump than
> the actual output of the `bump`-action.

The command skips merge, fixup and revert commits. It exits with status 1 when any of the other
checked messages is not compliant.

### (Pre-) Commit hook

You can use the CLI as a hook in Git to check messages you wrote by creating a `.git/hooks/commit-msg` file with these contents:

```sh
#!/bin/sh
exec commisery check "$@"
```

#### pre-commit

To run the check with [pre-commit], add the hook to your `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/tomtom-international/commisery-action
    rev: <release tag>
    hooks:
      - id: commisery
```

Then install it for the `commit-msg` stage:

```sh
pre-commit install --hook-type commit-msg
```

The CLI requires Node.js 24 or newer. By default, pre-commit installs the hook with the `node` on
your `PATH`. If that version is older and npm's `engine-strict` setting is enabled, the hook fails to
install with `EBADENGINE`. To make pre-commit download a matching Node.js instead, set
`language_version` on the hook:

```yaml
      - id: commisery
        language_version: '24.21.0'
```

A major-only value such as `'24'` selects the newest 24.x release, but requires nodeenv 1.11.0 or
newer in pre-commit's environment.

## Configuration overview

You can validate your configuration file by running the `overview` command. This will provide a human-readable
overview of your configuration file;

```sh
Usage: commisery overview [options]

Lists the accepted [Conventional Commit] types and rules (including description)

Options:
  -h, --help  display help for command
```

Please refer to the [Configuration parameters](./configuration.md) for more details.

[Conventional Commits]: https://www.conventionalcommits.org/en/v1.0.0/
[Conventional Commit]: https://www.conventionalcommits.org/en/v1.0.0/
[pre-commit]: https://pre-commit.com/
