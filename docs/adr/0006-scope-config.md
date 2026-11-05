# 0006. Scope and config

Status: accepted

## Context

The agent works in many workspaces. A scope labels a note, and a profile selects the scopes and the config. The config comes from a TOML file and from the harness.

## Decision

A scope is a key `kind:name`, and the store holds no record for it. The active scope comes from ordered rules in `[scope_default]`. The plugin config merges the TOML file, the profile patch, and the preset. The profile gives two independent budgets and the subagent mode. The patch gives `customPrompt` and `customPromptAppend`.

- 0017: The plugin package has two entry points: `.` and `./preset`.
- 0042: The project does not adopt the scope registry.
- 0043: A wrong key of a scope changes by an `amend` of the record.
- 0044: An `amend` moves a record to the key in its `scope` field, and it does so for a record with `content_cleared` too.
- 0045: The configuration is a TOML file with a `store` section and one `[profile.<name>]` section for each profile.
- 0046: The configuration sets no total budget.
- 0060: A scope key has the form `kind:name`.
- 0061: The scope grammar covers the keys that the agent sees.
- 0062: The `pos` of an address is the ordinal in the scope.
- 0063: The part `*` of a scope key stands in the kind or in the name, and it matches any text of that part.
- 0065: The plugin config is a deep merge of three layers: the memlens TOML file, the profile patch in `cordis.patch.yml`, and the agent preset patch.
- 0073: The profile patch gives `customPrompt`, which replaces the policy text, and `customPromptAppend`,
which follows it..

## Alternatives

A scope registry. A free-form key. One total budget. A YAML file. A key in the TOML file only.

## Consequences

A wrong key changes by an `amend` of the record. The profile lists its scopes. The `customPrompt` text replaces the policy text, and the append follows it.
