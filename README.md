# Conventional Commit Messages
[![Download](https://img.shields.io/badge/Download-Linux%20x64-blue)](https://github.com/tomtom-international/commisery-action/releases/latest/download/commisery-linux-x64) [![Download](https://img.shields.io/badge/Download-MacOS%20arm64-blue)](https://github.com/tomtom-international/commisery-action/releases/latest/download/commisery-macos-arm64) [![Download](https://img.shields.io/badge/Download-MacOS%20x64-blue)](https://github.com/tomtom-international/commisery-action/releases/latest/download/commisery-macos-x64)

This GitHub Action consists of two major components:

- Scan all commits in your Pull Request against the [Conventional Commits] standard
- Create GitHub Releases based on unreleased [Conventional Commits]

It is possible to apply the following version scheme(s):
- [Semantic Versioning](docs/semantic-versioning.md)
- [SDK Versioning](docs/sdk-versioning.md)

## GitHub Actions integration
Please refer to [this documentation](docs/github-action.md) for more 
information about how the integrate the `commisery-action` in your GitHub
Actions workflows.

## Command-line Interface
You can find more information on how to use the CLI on the [dedicated page](docs/cli.md)

[Conventional Commits]: https://www.conventionalcommits.org/en/v1.0.0/
[Commisery]: https://pypi.org/project/commisery/
