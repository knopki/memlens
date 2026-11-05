# 0072. Index port

Status: accepted

## Context

S-085 gives the hit, the transaction, and the tokenizer. The parse and the limit stay with the port.

## Decision

The index port takes the query after the parse: the words, the words with `-`, the scopes, the kinds, `since`, `until`, `due`, and the limit. It limits the answer itself, and it gives the hits by `ts` from the newest, then by `pos` from the largest.

## Alternatives

The port takes the raw words. The caller limits by scope, kind, date, and `due`. The order by `pos` only.

## Consequences

The two backends share one query contract, and one test runs on both. A hit costs one row of the index, and no read of a record.
