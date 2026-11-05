# 0020. Event model

Status: accepted

## Context

The customer gave the data model. An immutable event keeps the history and gives a simple merge.

## Decision

The log holds events, and a `redact` clears the content of its target. Each event has `id` (ULID), `at`, `op`, and `scope`, and a payload that belongs to the op. The ops are `note`, `amend`, `hide`, `redact`, `review`, `accept`, and `dismiss`.

## Alternatives

One mutable record for each note. One full snapshot for each write.

## Consequences

The first event of a note gives its identity. The state of a note is a projection over its events. A new op needs a new payload schema.
