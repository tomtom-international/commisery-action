# Configuration

You can configure `commisery-action` using a YAML-based configuration file:

```yaml
max-subject-length: 120
tags:
  docs: Documentation changes not part of the API
  example:
    description: Changes to example code in the repository
  perf:
    description: Performance improvements
    bump: true

disable:
  - C001
  - C018
enable:
  - C026
allowed-branches: "^ma(in|ster)$"
initial-development: false  # OPTIONAL, defaults to `true`
```

| Item | Default value |Description | 
| --- | --- | --- |
| `max-subject-length` | `80` | The maximum length of the subject of the commit message |
| `tags` | `fix`, `feat`, `build`, `chore`, `ci`, `docs`, `perf`, `refactor`, `revert`, `style`, `test`, `improvement` | Specify a custom list of Conventional Commit types to allow. If provided, this will overwrite the default list, so be sure to include those if you want to retain them.<br>`tags` takes a dict per type tag, with two values that can be set:<ul><li>`description`: a human-readable description of what the type should be used for.</li><li>`bump`: if set to `true`, will cause commits with this type to also bump the `PATCH` version component, same as `fix`.</li></ul>If you only specify YAML string, it shall be treated as the `description`; the `bump` will be `false` implicitly. <br><br>**NOTE:** The type tags `feat` and `fix` will automatically be provided. |
| `disable` | `None` | List of rules to disable as part of the checker |
| `enable` | `None` | List of rules to enable as part of the checker (some rules are disabled by default) |
| `allowed-branches` | `.*` | A regex specifying from which branch(es) releases and Git tags are allowed to be created |
| `initial-development` | `true` | A boolean indicating that this project is still under _initial development_. During this state, any commit message containing a breaking change will result in a `MINOR` version bump. |

> :bulb: By default `commisery-action` will search for the file `.commisery.yml`. 
You can specify a different file with the `config` input parameter.