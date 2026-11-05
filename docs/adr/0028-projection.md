# 0028. Projection

Status: accepted

## Context

A reference must find its target in each order of arrival, and two stores must agree without one clock.

## Decision

The projection is deterministic over the order `(at, id)`, and it makes two passes: one for the records and one for the operations.

## Alternatives

One pass in the order of the log. A global clock for each event.

## Consequences

A target exists before the first operation. A `pos` and an arrival order change nothing. A reference to a later note still applies.
