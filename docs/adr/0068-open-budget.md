# 0068. Open budget

Status: accepted

## Context

S-070 names `depth` as the level of detail and names the working budget as the limit of the descent. A silent gap loses records.

## Decision

The descent of `memory_open` stops at a working budget of 4096 visited nodes and at an answer of 24 KiB. `depth` gives the level of detail from 1 to 4, and it is no limit of the descent. A range that the budget stops comes back with `needsExpansion` and its `label`.

## Alternatives

A depth limit on the search for clean parts. No reopen of the stopped range.

## Consequences

A deep tree gives an addressable range, and one call opens it again. REQ-329 to REQ-337 hold the rules.
