# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.2.1] - 2022-10-11
### Fixed
- Missing `pull-requests` permission is no longer fatal when creating a new GitHub Release
- Example workflow in the documentation is now using valid YAML-syntax

## [2.2.0] - 2022-10-10
### Added
- Pull Request references are now added to each commit in the GitHub Releases' changelog

## [2.1.0] - 2022-10-06
### Added
- Ability to specify the branches from which you allow release to be created (part of the configuration file).
- You can avoid the creation of GitHub Releases (and instead only rely on tags) by using `create-tag: true` in combination with `create-release: false`
- Automatic generation of a changelog based on the release Conventional Commit messages

## [2.0.1] - 2022-09-29
### Fixed
- The bump action no longer tries to fetch the repository's complete commit history, but is limited to the last 100 commits and tags.

## [2.0.0] - 2022-09-28
### Removed
- Python no longer needs to be installed in order to run this action
- No longer depend on the Python module `Commisery`

### Changed
- Conventional Commit Message validation is now fully handled within NodeJs, improving the execution performance significantly.
- Slight improvement to the logging output

## [1.3.1] - 2022-09-21
### Fixed
- Configuration file is now retrieved from the current branch iso main development branch.

## [1.3.0] - 2022-09-21
### Added
- You can specify the location of the Commisery configuration file with the `config`-input parameter
- Support the Commisery configuration file (without the need to perform a checkout of the repository)

## [1.2.1] - 2022-09-19
### Deprecated
- The `mode` input option is replaced by `validate-pull-request` and `validate-commits`
- The `pull_request` input option is no longer required to be specified and will be determined automatically

### Changed
- The Pull Request title is now validated by default

## [1.2.0] - 2022-09-19
### Added
- New GitHub action entrypoint ("bump"), which can create a new release (and implicitly a Git tag), based on the Conventional Commits since the latest tag, provided it is a Semantic Versioning-compatible tag.

## [1.1.0] - 2022-09-07
### Changed
- Add execution output as part of the standard logging

### Added
- Ability to specify the validation mode (input: `mode`)  - Pull Request, Commits or both.

## [1.0.3] - 2022-06-21
### Changed
- Reworked the error messages to improve clarity in build logs and on the summary page (w/o introducing duplication of data).
- Removed unnecessary repository check-out from the documentation

## [1.0.2] - 2022-05-28
### Changed
- Improved user feedback during execution of the action

## [1.0.1] - 2022-05-18
### Fixed
- The requirements.txt file is now properly included in the npm package

## [1.0.0] - 2022-05-18
### Added
- Summary page containing non-compliancy issues against Conventional Commits
- Validation of prerequisites (Python >= 3.8)
- Check every commit in your Pull Request for compliancy against Conventional Commits

