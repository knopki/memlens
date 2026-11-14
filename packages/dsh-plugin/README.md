# @memlens/dsh-plugin

The DeepSeek Harness plugin of memlens.

**Status:** stages 1 to 4. The plugin opens the memory store, gives each agent its memory context,
its memory tools, and the nudge, and runs the background compaction. The plugin console stays
outside this package.

## Memory surface

The plugin registers one runtime context for each agent. The context holds the memory slice and
stays stable between the accepted triggers: a fresh session, a successful harness compaction, and
an idle time above the model TTL.

The plugin registers these tools in the context of each agent:

| Tool          | Main agent | Propose child | Read child |
| ------------- | ---------- | ------------- | ---------- |
| memory_note   | yes        | yes, proposal | no         |
| memory_find   | yes        | yes           | yes        |
| memory_open   | yes        | yes           | yes        |
| memory_map    | yes        | yes           | yes        |
| memory_forget | yes        | no            | no         |
| memory_review | yes        | no            | no         |

An `off` child gets no memory tool and no memory context. A child proposal collects under the child
session id, and the parent receives one report line per proposal when the child ends.

The nudge counts the tool calls and the turns of the main agent. A reached limit injects one line,
and a note write or a nudge resets both counters.

The background worker starts a compaction at the dirty threshold and at the store idle limit. The
worker calls the configured LLM route and keeps its call limits.

## Entries

- The host entry `@memlens/dsh-plugin` has the plugin name `dsh-memlens`. The bundle patch inserts the
  row `memlens`.
- The preset entry `@memlens/dsh-plugin/preset` has the plugin name `memlens/preset`. An agent preset
  mounts it with the key `profile`.

### Host row

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
```

### Preset row

Add this row to the `plugins` list of an agent preset. The key `profile` is mandatory.

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: default
```

## Configuration

The plugin reads the base file `$XDG_CONFIG_HOME/memlens/config.toml`. The plugin does not write this
file. If the file is absent, the built-in fallback applies: the profile `default`, the scopes `*`,
the budgets 20 and 10, and the scope `user:notes`.

The store path comes from the plugin config first, then from `MEMLENS_STORE`, then from the base file.

The preset overrides the plugin patch. The plugin patch overrides the base profile.
The preset key `profile` selects the profile name.

The session model needs at least 65 536 context tokens. The plugin stops a session with a smaller
model.

Display metadata is in `locale/<language>.json`. The icon is `icon.svg`.

## Build and test

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

## Version

The lowest accepted version is DeepSeek Harness `0.2.2-rc.3`. The manifest accepts `>=0.2.2-rc.3`.
