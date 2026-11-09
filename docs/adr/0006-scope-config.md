# 0006. Scope and config

Status: accepted

## Context

The agent works in many workspaces. A scope labels a note, and a profile selects the scopes and the config. The config comes from a TOML file and from the harness.

## Decision

A scope is a key `kind:name`, and the store holds no record for it. The active scope comes from ordered rules in `[scope_default]`. The plugin config merges the TOML file, the profile patch, and the preset. The profile gives two independent budgets and the subagent mode. The patch gives `customPrompt` and `customPromptAppend`.

A content amendment within one scope keeps its address. A transfer empties the old slot and allocates a fresh destination slot.
The projection treats this as leaving one scope and entering another. It keeps the original note id and amendment links.
Returning to the original scope allocates another new slot. Old empty slots never make the remaining records shift during a local transfer.
Cleared content stays cleared after a transfer. See [S-142](../statements.md#s-142).

## Alternatives

A scope registry. A free-form key. One total budget. A YAML file. A key in the TOML file only.

## Consequences

A wrong key changes by an `amend` of the record. The profile lists its scopes. The `customPrompt` text replaces the template of the slice, and the append follows it.
