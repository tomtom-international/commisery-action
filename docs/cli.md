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

### (Pre-) Commit hook

You can use the CLI as a hook in Git to check messages you wrote by creating a `.git/hooks/commit-msg` file with these contents:

```sh
#!/bin/sh
exec commisery check "$@"
```

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
