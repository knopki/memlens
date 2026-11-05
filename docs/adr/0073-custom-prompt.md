# 0073. Custom prompt

Status: accepted

## Context

The slice starts with the policy text. A profile can need another text, or an addition to the default
text.

## Decision

The profile patch gives `customPrompt`, which replaces the policy text, and `customPromptAppend`,
which follows it.

## Alternatives

One field for both roles. A key in the TOML file only. No custom text.

## Consequences

A profile can tune the instructions for its notes. A custom text can lose the default rules. The
append keeps the default text.
