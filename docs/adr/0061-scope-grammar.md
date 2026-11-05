# 0061. Scope grammar

Status: accepted

## Context

The catalog key is internal, and a visible key costs tokens. A display prefix keeps the slice readable, and the tool accepts the previous copy.

## Decision

The scope grammar covers the keys that the agent sees. A technical key of the store stays outside it, and the catalog key `__catalog__:<profile>` is hidden. The address holds no `#`, the renderer adds it, and the tool strips it. `workspace:<id> → key` is a rule.

## Alternatives

A visible catalog key. A `#` at the tool.

## Consequences

The agent never names the catalog key. A copied address works with the `#` and without it. Each call runs the rules.
