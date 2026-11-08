# 0006. Scope and config

Status: accepted

## Context

The agent works in many workspaces. A scope labels a note, and a profile selects the scopes and the config. The config comes from a TOML file and from the harness.

## Decision

A scope is a key `kind:name`, and the store holds no record for it. The active scope comes from ordered rules in `[scope_default]`. The plugin config merges the TOML file, the profile patch, and the preset. The profile gives two independent budgets and the subagent mode. The patch gives `customPrompt` and `customPromptAppend`.

## Alternatives

A scope registry. A free-form key. One total budget. A YAML file. A key in the TOML file only.

## Consequences

A wrong key changes by an `amend` of the record. The profile lists its scopes. The `customPrompt` text replaces the template of the slice, and the append follows it.
