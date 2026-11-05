# 0002. Event log

Status: accepted

## Context

The log must survive a session, a restart, and a second machine. The order of arrival can differ, and a reader must get one answer. A user must be able to erase content.

## Decision

The log is the only truth. An event is immutable, and a `redact` clears the content of its target. The projection is deterministic over the order `(at, id)` in two passes. The state machine and the supersede rule give one answer for any order of arrival.

- 0020: The log holds events, and a `redact` clears the content of its target.
- 0021: `pos` is not a field of an event.
- 0023: A `supersedes` stays inside one scope.
- 0024: An event has two times.
- 0025: The note event holds `review_at` only, the date of the next review.
- 0026: The prior-art table gives the principles, not the field names.
- 0027: A `target` field names the `note` event.
- 0028: The projection is deterministic over the order `(at, id)`, and it makes two passes: one for the records and one for the operations..
- 0029: The supersede is irreversible.
- 0031: The state order is `live`, `hidden`, `proposed`, `deleted`.
- 0032: An `accept` event clears the effect of an earlier `hide` event.

## Alternatives

Mutable records. A full snapshot for each change. One pass in the order of the log. Last write wins.

## Consequences

`pos` is not a field, and the store counts the creating event in the scope. An import is a union by `id`. The state order is `live`, `hidden`, `proposed`, `deleted`. A `redact` is final.
