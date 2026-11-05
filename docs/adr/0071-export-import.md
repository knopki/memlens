# 0071. Export import

Status: accepted

## Context

S-073 gives the rules. An error on a conflict stops a transfer.

## Decision

The default export copies the whole store under an exclusive lock. The flag `--scope` writes one scope. An import unions the events by `id`. A payload conflict with one `id` gives no error: the later `at` wins, and an equal `at` keeps the local event. The events of a record with a `redact` arrive sanitized.

## Alternatives

An export by scope. An error on a payload conflict. The arrival order as the winner.

## Consequences

Two sessions of one store converge. A divergent payload resolves to the later `at`, and the log keeps both events.
