# 0044. Amend moves

Status: accepted

## Context

A wrong key must leave the catalog of the scope that it does not belong to, and an erased record must not keep it.

## Decision

An `amend` moves a record to the key in its `scope` field, and it does so for a record with `content_cleared` too. The tree keeps its geometry.

## Alternatives

A separate op `move`. A rewrite of the events of the old key.

## Consequences

The op list keeps seven events. The `pos` and the summaries stay. The cards of both scopes pick up the change.
