# 0003. Store

Status: accepted

## Context

One store holds many profiles, scopes, and records. A machine can run a SQLite file or a JSONL file. Several processes write one store, and two machines need a transfer.

## Decision

The store has two backends of equal rank. The SQLite backend uses one transaction for each append and write-ahead logging. The JSONL backend takes a lock. The export copies the store under one read transaction, and the import unions the events by `id`. The index is a separate port over FTS5.

- 0014: The store has two backends of equal rank: sqlite and jsonl.
- 0016: A merge is a union of events by id.
- 0049: `storeRev` is a counter that grows in the transaction of each edit in SQLite, and a fingerprint of the file in JSONL.
- 0071: The default export copies the whole store under an exclusive lock.
- 0072: The index port takes the query after the parse: the words, the words with `-`, the scopes, the kinds, `since`, `until`, `due`, and the limit.

## Alternatives

One backend. A database server. Last write wins. A manifest with a block hash.

## Consequences

One store test runs on both backends. `storeRev` is a counter in SQLite and a fingerprint in JSONL. The index is a cache over the log.
