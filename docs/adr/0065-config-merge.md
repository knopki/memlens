# 0065. Config merge

Status: accepted

## Context

The customer gave two entry points and a deep merge. The preset names the profile. The plugin needs the store path, the writer, the nudge, the language, and the cache TTL. The TOML file gives the store backend, so the plugin reads it as the base. The `language` key gives the language that the prompt recommends for the notes. The default is `en`, because the FTS support is better. The flag is a CLI setting and the patch is a plugin setting. The two programs have separate chains.

## Decision

The plugin config is a deep merge of three layers: the memlens TOML file, the profile patch in `cordis.patch.yml`, and the agent preset patch. The patch wins over the TOML, and the preset wins over the profile. Arrays replace. The general layer gives `defaultProfile`. The preset must give `profile`. The plugin id is `memlens`, and the preset id is `memlens/preset`.

## Alternatives

One file for the harness and the CLI. A merge in the host. Arrays that concatenate.

## Consequences

The CLI reads the TOML file. The harness reads the patch layers. A preset without `profile` fails at load. The plugin takes the patch first, then `MEMLENS_STORE`, then the TOML file. The CLI takes `--store` first.
