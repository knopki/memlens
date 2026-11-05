# 0042. No registry

Status: accepted

## Context

The registry has five ops and a merge rule for two fields. S-033 keeps the key only, and the first note gives the text.

## Decision

The project does not adopt the scope registry. A scope has no event of its own and no label. The store keeps the key in the events of the records.

## Alternatives

The append-only `scopes.jsonl` with five ops. A registry in the configuration with the same five ops.

## Consequences

No scope event in the log. No `owner` error at an import. A scope exists because a record names its key.
