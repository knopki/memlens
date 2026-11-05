# 0035. Card dirty

Status: accepted

## Context

An amend or a redact of a source changes the card text, and a rebuild of each card on each change costs tokens.

## Decision

A card becomes dirty after a change of a source, and the store rebuilds it from the live records that stay.

## Alternatives

Rebuild each card at each change. Keep a stale card until the next session.

## Consequences

The catalog tree marks the ancestors. A rebuilt card holds only the live text.
