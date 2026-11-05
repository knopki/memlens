# 0032. Accept clears hide

Status: accepted

## Context

S-022 returns a hidden proposed record to the view, and the state alone cannot keep a proposed record out of it.

## Decision

An `accept` event clears the effect of an earlier `hide` event. The record becomes `live` and enters the view again.

## Alternatives

Keep the record out of the view after an `accept`. Add a second flag to the record.

## Consequences

The order of the events decides the visibility. A `hide` after an `accept` takes the live record out of the view again.
