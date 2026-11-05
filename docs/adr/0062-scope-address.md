# 0062. Scope address

Status: accepted

## Context

A count in the scope would renumber a record that changes its scope, and the address must stay. The kinds name a family of keys, and no rule uses a kind.

## Decision

The `pos` of an address is the ordinal in the scope. A kind is a label, and it changes no behavior. The `[scope_default]` section holds `rules` and `default`, and it holds no profile key.

## Alternatives

A count in the scope. A rule for each kind. A profile key in the section.

## Consequences

A moved record keeps its address. Two scopes with different kinds behave in one way. The preset gives the profile (Q-020).
