# 0026. Idem key

Status: accepted

## Context

The customer gave the table as a source of ideas. A copied name disagrees with the event model.

## Decision

The prior-art table gives the principles, not the field names. The project takes the idempotency rule and names the key `idem`. The model holds no `sourceId`.

## Alternatives

Copy the field names of each implementation. Keep `sourceId` next to `idem`.

## Consequences

One name for one concept. D-018 keeps the rule, and this decision gives the name.
