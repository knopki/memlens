# 0021. Position

Status: accepted

## Context

The addresses `#a-b` need an order, and two stores must merge without one global order.

## Decision

`pos` is not a field of an event. It is the ordinal of the creating event in the scope of the record, and it stays out of an export.

## Alternatives

A global counter in each event. An exported `pos`. A hash of the content.

## Consequences

The addresses are local to one store. A reader must not use a `pos` of another store. A merge keeps the order of the receiving log.
