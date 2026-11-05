# 0036. No scrub

Status: accepted

## Context

S-017 takes `scrub` out, and S-024 keeps it out. The card needs the same form as a note.

## Decision

The model has no `scrub` step. A `redact` event writes the sanitized form into its target, and the store extends the form to each card of the target.

## Alternatives

Keep `scrub` as a maintenance step. Keep the text of a card after a redact of a source.

## Consequences

One path for the sanitized form. The store rewrites the target event at the redact. A card of the source loses its text in the same step.
