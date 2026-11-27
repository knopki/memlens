# Configuration

memlens resolves the configuration from the built-in defaults and three optional layers. Each
layer is optional, so a fresh machine needs no configuration file.

This page holds the complete format and one example of each layer.

## The three layers

| Layer    | Place                                 | Writer            |
| -------- | ------------------------------------- | ----------------- |
| Defaults | The code                              | No caller         |
| Base     | `config.toml` in the config directory | The user, by hand |
| Patch    | The `config` table of the plugin row  | The host profile  |
| Preset   | The `config` table of the preset row  | The agent preset  |

The layers merge in a fixed order: the defaults, then the base file, then the patch, then the
preset. A later value wins over an earlier value. A table merges key by key. A scalar or a list
replaces its earlier value. The CLI reads the defaults and the base file, and it holds no patch and
no preset.

## Value formats

- A scope key holds a kind and a name, separated by the first colon, for example
  `project:dsh/memlens`. The kind takes lowercase letters, digits, periods, underscores, slashes,
  and hyphens, and it starts with a letter or a digit. The name takes any text without whitespace,
  control or format characters, `#`, commas, and brackets. The store lowercases the kind before a
  write, and it keeps the case of the name.
- A glob matches the whole key. The part `*` matches any text. For example, `project:*` matches each
  key that starts with `project:`. The kind is free text, so the glob does not split the key.
- A duration is one number with one unit: `30s`, `5m`, or `2h`.

## The base file

The base file is `config.toml` in the configuration directory of the platform. The data lives in
the data directory of the platform. An absolute `XDG_CONFIG_HOME` or `XDG_DATA_HOME` wins over the
platform directory.

| Platform | Configuration directory                              | Data directory                                          |
| -------- | ---------------------------------------------------- | ------------------------------------------------------- |
| Linux    | `$XDG_CONFIG_HOME/memlens`, else `~/.config/memlens` | `$XDG_DATA_HOME/memlens`, else `~/.local/share/memlens` |
| macOS    | `~/Library/Application Support/memlens`              | `~/Library/Application Support/memlens`                 |
| Windows  | `%APPDATA%\memlens`                                  | `%LOCALAPPDATA%\memlens`                                |

The command `memlens config show` prints the resolved values, and it writes no file.

An absent key gives its default. An absent file uses the built-in defaults. An invalid or unreadable
file gives the built-in defaults, and the store opens from them. The console shows the error, and a
later valid file applies with no restart. The CLI reports an invalid file as an error.

### The complete example

```toml
# Each key is optional. Copy the parts that you want to change.

# The tokenizer of the search index: zh and ja select the trigram tokenizer.
# An existing store keeps its tokenizer.
language = "en"

# The profile of a caller that states no profile name.
defaultProfile = "default"

[store]
# The directory of the SQLite store. The default is the data directory of the platform.
# A leading tilde means the home directory.
path = "~/store"
# The idle time in seconds that starts the background compaction.
idle = 300

# One table per profile. The name is your choice.
[profile.default]
# The scopes that this profile sees.
scopes = ["*"]
# The memory of a subagent: propose, read, or off.
subagents = "propose"

[profile.default.budget]
# The line limit of the tree of the active scope.
here = 20
# The line limit of the directions list.
directions = 10

# A second profile that sees the work projects only.
[profile.work]
scopes = ["project:dsh/*", "user:notes"]

[profile.work.budget]
here = 40
directions = 20

# The rules that map one working context to its active scope.
# The rules run in order, and the first match wins.
[scope_default]
# The key of a profile without a session context.
default = "project:misc"

# The rules match the canonical remote: the host and the path, with no
# scheme, no user part, no `.git` suffix, and no trailing slash. The glob
# matches the whole text. The part {repo} takes the repository name of
# the remote.
[[scope_default.rules]]
match = "git_remote"
glob = "github.com/your-org/*"
key = "project:{repo}"

# The glob matches the working directory.
[[scope_default.rules]]
match = "path"
glob = "/home/you/prj/*"
key = "project:misc"

# The id equals the workspace id of the harness.
[[scope_default.rules]]
match = "workspace"
id = "my-workspace"
key = "project:work"

# The nudge counters of the main agent. A note write or a nudge resets both.
[nudge]
tool_calls = 10
turns = 10

# Each text must hold the part {n}.
[nudge.text]
tool_calls = "[memory] {n} tool calls passed. Write only what a later session needs."
turns = "[memory] {n} turns passed. Write only what a later session needs."

# Set the model route to enable background compaction.
[compaction]
provider = "my-provider"
model = "my-model"
# Set effort only when the model needs a specific value.
# effort = "low"
# The input count of one model call. The default is 10, and the key sets no upper limit.
batch = 10
# The model call limit per hour.
maxCallsPerHour = 120

# The review period of each note kind, in days.
[review]
decision = 90
preference = 180
fact = 30
gotcha = 90
task = 7
note = 180
```

### The top keys

| Key              | Type   | Default     | Effect                                            |
| ---------------- | ------ | ----------- | ------------------------------------------------- |
| `language`       | string | `"en"`      | The tokenizer of the search index. The values `zh` and `ja` select the trigram tokenizer. |
| `defaultProfile` | string | `"default"` | The profile of a caller that states no profile name. |

### The store section

| Key    | Type   | Default            | Effect                                                                       |
| ------ | ------ | ------------------ | ---------------------------------------------------------------------------- |
| `path` | string | The data directory | The directory of the SQLite store. A leading tilde means the home directory. |
| `idle` | number | `300`              | The idle time in seconds that starts the background compaction.              |

### The profile tables

Each `[profile.<name>]` table holds one profile. The name is your choice.

| Key                 | Type      | Default     | Effect                                        |
| ------------------- | --------- | ----------- | --------------------------------------------- |
| `scopes`            | glob list | `["*"]`     | The scopes that the profile sees.             |
| `subagents`         | string    | `"propose"` | The memory of a subagent: `propose`, `read`, or `off`. |
| `budget.here`       | number    | `20`        | The line limit of the tree of the active scope. |
| `budget.directions` | number    | `10`        | The line limit of the directions list.        |

### The scope rules

The `[scope_default]` section maps one working context to its active scope key.

| Key      | Type      | Default         | Effect                              |
| -------- | --------- | --------------- | ----------------------------------- |
| `default` | scope key | `project:misc` | The key of the last step of the automatic list. |
| `rules`  | rule list | `[]`            | The ordered rules. The first match wins. |

Each rule is one table with the key `match`:

| `match` value | Extra keys    | The glob or id matches                      |
| ------------- | ------------- | ------------------------------------------- |
| `git_remote`  | `glob`, `key` | The canonical remote: the host and the path, for example `github.com/your-org/memlens`. The glob matches the whole text. |
| `path`        | `glob`, `key` | The working directory.                      |
| `workspace`   | `id`, `key`   | The workspace id of the harness.            |

In a `git_remote` key, the part `{repo}` takes the repository name of the remote.

A context without a matching rule gets its key from the automatic list. The list runs: the git
remote, the repository name, the workspace name, the directory name, then the key of `default`.

Run `memlens scope` in a directory. The answer gives the inputs, the verdict of each rule, and the
key.

### The nudge section

| Key              | Type   | Default | Effect                                           |
| ---------------- | ------ | ------- | ------------------------------------------------ |
| `tool_calls`     | number | `10`    | The tool call count that fires the nudge line.   |
| `turns`          | number | `10`    | The turn count that fires the nudge line.        |
| `text.tool_calls`| string | built-in | The line of the tool call counter. It must hold `{n}`. |
| `text.turns`     | string | built-in | The line of the turn counter. It must hold `{n}`. |

### The compaction section

The worker needs an explicit `provider` and `model`. When either is absent, it logs an error and
makes no model call. A model call error appears in the worker journal and the host log.
Each model call carries one batch of merge inputs, and the default batch is ten. The key `batch` sets
no upper limit, and one call can hold any count above zero.

| Key              | Type   | Default         | Effect                                        |
| ---------------- | ------ | --------------- | --------------------------------------------- |
| `provider`       | string | `""`            | The provider of the merge model.              |
| `model`          | string | `""`            | The model of the merge.                       |
| `effort`         | string | `""`            | The effort value. An empty value sends no effort. |
| `batch`          | number | `10`            | The input count of one model call. The value is a whole number above zero, and the key sets no upper limit. |
| `maxCallsPerHour`| number | `120`           | The model call limit per hour.                |

The product removes the key `mode`, and the section accepts no key of that name. A file that holds it
fails the check.
A batch answer publishes each range with a good line. The worker retries an open range in a batch of
half the size, down to one input. A range that no attempt builds stays dirty for the next pass.

### The review section

The `[review]` section holds the review period of each note kind, in days.

| Kind        | Default |
| ----------- | ------- |
| `decision`  | `90`    |
| `preference`| `180`   |
| `fact`      | `30`    |
| `gotcha`    | `90`    |
| `task`      | `7`     |
| `note`      | `180`   |

## The patch layer of the plugin

The plugin row of DeepSeek Harness carries one `config` table. Add the table to the plugin row in
the patch file of your profile. A row with the id `memlens` overrides the row of the plugin bundle.

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
      config:
        defaultProfile: work
        budget:
          here: 40
        customPromptAppend: "Answer with the memory of the team."
```

Each key is optional. A rejected value degrades to the empty layer, so no row value blocks a
session.

| Key                   | Type    | Effect                                                     |
| --------------------- | ------- | ---------------------------------------------------------- |
| `store.path`          | string  | The store directory. It wins over `MEMLENS_STORE`.        |
| `store.idle`          | number  | The idle time in seconds that starts the compaction.      |
| `defaultProfile`      | string  | The profile of a caller that states no profile name.      |
| `budget.here`         | number  | The line limit of the tree of the active scope.           |
| `budget.directions`   | number  | The line limit of the directions list.                    |
| `compaction.<key>`    | see above | One key of the compaction section.                       |
| `nudge.<key>`         | see above | One key of the nudge section. The `text` table replaces its value as a whole. |
| `customPrompt`        | string  | Replaces the policy text of the slice.                    |
| `customPromptAppend`  | string  | Appends text to the policy of the slice.                  |

## The preset layer

One agent preset mounts the preset entry of memlens with its own `config` table. The preset wins
over the patch.

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: work
    budget:
      here: 30
    customPromptAppend: "Answer with the memory of the team."
```

| Key                  | Type    | Effect                                                 |
| -------------------- | ------- | ------------------------------------------------------ |
| `profile`            | string  | The profile of this agent. An absent key selects the default profile. |
| `budget.here`        | number  | The line limit of the tree of the active scope.       |
| `budget.directions`  | number  | The line limit of the directions list.                |
| `nudge.<key>`        | see above | One key of the nudge section.                        |
| `customPrompt`       | string  | Replaces the policy text of the slice.                |
| `customPromptAppend` | string  | Appends text to the policy of the slice.              |

The preset holds no compaction key and no store key.

## How the values resolve

- The profile name comes from the preset `profile`, then the patch `defaultProfile`, then the base
  `defaultProfile`.
- A profile name that the base file does not list gets the default values: the scopes `["*"]`, the
  budgets 20 and 10, and the subagent mode `propose`. No error comes from a missing profile.
- The store path comes from the flag `--store`, then the patch `store.path`, then
  `MEMLENS_STORE`, then the base file. The CLI gives no patch layer, so its order is the flag,
  then the environment, then the file.

## Read the resolved configuration

```sh
memlens config show
memlens config show --json
memlens config show --profile work
```

The command prints each resolved value of this machine. The flag `--profile` selects the profile,
and the default profile applies without the flag.
