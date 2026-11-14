# @memlens/dsh-plugin

The DeepSeek Harness plugin of memlens.

**Status:** stage 1. The plugin opens the memory store and reads the configuration for each session.
It gives no memory tool and no memory context yet.

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

The tested version is DeepSeek Harness `0.2.2-rc.3`. The manifest accepts `>=0.2.1-0`. No test
covers an older version.
