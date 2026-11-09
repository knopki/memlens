# 0002. Event log

Status: accepted

## Context

The log must survive a session, a restart, and a second machine. The order of arrival can differ, and a reader must get one answer. A user must be able to erase content.

## Decision

The log is the only truth. An event is immutable, and a `redact` clears the content of its target. The projection is deterministic over the order `(at, id)` in two passes. The state machine and the supersede rule give one answer for any order of arrival.

## Alternatives

Mutable records. A full snapshot for each change. One pass in the order of the log. Last write wins.

## Consequences

`pos` is not a field, and the store counts the creating event in the scope. An import is a union by `id`. The state order is `live`, `hidden`, `deleted`. A proposal is a write with `proposed: true`, and a
`redact` is final. See [0012 Proposals](0012-proposals.md).
