# 0030. Final redact

Status: accepted

## Context

A privacy erase must not lose to a later patch or to an import.

## Decision

A `redact` event clears the content of a record for good, and a later `amend` changes no content of the record.

## Alternatives

Let the newest `amend` win. Erase the content of the event only.

## Consequences

The erase is final. An import of a full event changes no content of a redacted record.
