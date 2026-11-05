# 0027. Event target

Status: accepted

## Context

A later amend must find the same note, so the identity of a note must not move.

## Decision

A `target` field names the `note` event. The store follows the chain of events of the note.

## Alternatives

Let `target` name the newest event of the note.

## Consequences

An address stays valid after an amend. A reader needs the first event of a note only.
