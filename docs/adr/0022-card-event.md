# 0022. Card event

Status: accepted

## Context

The two levels use one engine, so one op set serves the notes and the catalog.

## Decision

A catalog card is a `note` event with `kind: "card"`, `for_scope`, and `for_sources`. The log has no separate card op.

## Alternatives

A separate `card` op. A separate log for the catalog.

## Consequences

The card follows the note rules for hide, redact, and amend. A query for the cards filters by `kind`.
