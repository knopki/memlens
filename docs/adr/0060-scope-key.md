# 0060. Scope key

Status: accepted

## Context

One grammar lets a profile name a family of keys with one wildcard. The rules keep the active scope out of each session.

## Decision

A scope key has the form `kind:name`. The kind is `project`, `global`, `agent`, `user`, `topic`, `task`, or `import`, and the name is lowercase. The active scope comes from the ordered rules of `[scope_default]`, and the first match wins. A repository with no match gets the `default` key. The visibility of a profile is its `scopes` list.

## Alternatives

A free-form scope string. One scope for each workspace in the plugin settings. No rules, and one scope for each repository.

## Consequences

A write outside the profile waits for a human. A wrong rule gives the default scope. The grammar covers the keys of the agent. See D-061.
