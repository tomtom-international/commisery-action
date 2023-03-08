# Command Line Interface

A stand-alone CLI tool is provided as part of the `commisery-action` package.

## Installation

You can download the latest version directly from GitHub.
We currently support the following architectures:

- [MacOS x86](https://github.com/tomtom-international/commisery-action/releases/latest/download/commisery-macos-x64)
- [MacOS ARM64](https://github.com/tomtom-international/commisery-action/releases/latest/download/commisery-macos-arm64)
- [Linux x86](https://github.com/tomtom-international/commisery-action/releases/latest/download/commisery-linux-x64)

We recommend renaming the binary to `commisery`...
```sh
$ mv commisery-[linux-x64|macos-x64|macos-arm64] commisery
```

...and ensure that you provide execution rights;
```sh
$ chmod +x commisery
```

## Compliance Check

You can use the `check` command to validate your commit messages for compliance with Conventional Commits:

```sh
Usage: commisery check [options] [TARGET...]

Checks whether commit messages adhere to the Conventional Commits standard.

Arguments:
  TARGET      The `TARGET` can be:
    - a single commit hash
    - a file containing the commit message to check
    - a revision range that `git rev-list` can interpret
   When TARGET is omitted, 'HEAD' is implied.

Options:
  -h, --help  display help for command
```

### (Pre-) Commit hook

You can use the CLI as a hook in Git to check messages you wrote by creating a `.git/hooks/commit-msg` file with these contents:

```sh
#!/bin/sh
exec commisery "$@"
```

## Configuration overview

You can validate your configuration file by running the `overview` command. This will provide a human-readable
overview of your configuration file;

```sh
Usage: commisery overview [options]

Lists the accepted Conventional Commit types and Rules (including description)

Options:
  -h, --help  display help for command
```

Please refer to the [Configuration parameters](./configuration.md) for more details.