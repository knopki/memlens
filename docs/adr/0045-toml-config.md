# 0045. TOML config

Status: accepted

## Context

One file must hold the store settings and the profiles, and a script must change the path without an edit of the file.

## Decision

The configuration is a TOML file with a `store` section and one `[profile.<name>]` section for each profile. The CLI store path comes from `--store`, then `MEMLENS_STORE`, then the file.

## Alternatives

A YAML file. One file for each profile. The environment only.

## Consequences

One file for the store and the profiles. A flag wins over the environment, and the environment wins over the file.
