# 0037. Card fields

Status: accepted

## Context

A card is a retelling of a scope, and nobody reviews it and nobody proposes it.

## Decision

A card carries `body`, `kind`, `ts`, `session`, `for_scope`, and `for_sources`, and no `review_at`, `proposed`, `turn`, or `preset`.

## Alternatives

Give a card each field of a note. Give a card a review date.

## Consequences

The card payload stays small. The store refuses a card with a review field or a proposal field.
