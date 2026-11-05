# 0015. Tree cache

Status: replaced by 0050

## Context

The customer gave the cache rule and the snapshot rule. A deterministic view stays testable and cheap to rebuild.

## Decision

The tree is a cache over the notes. The view is a deterministic function of the notes, the built nodes, and the store version. The slice is a materialized snapshot, and the `sessions` record points to it.

## Alternatives

Build the text on each turn. Keep the text in the session log.

## Consequences

A rebuild gives the same text. The snapshot has an id, so a reader can name the exact slice. D-050 and D-052 replace this decision.
