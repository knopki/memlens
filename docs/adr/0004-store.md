# 0004. Store

Status: accepted

## Context

One store holds many profiles, scopes, and records. It has two backends of equal rank. An export copies the store, and an import unions the events by `id`. The index is a cache over the log.

## Decisions

| ID | Date | Decision | Context | Alternatives | Consequences |
| --- | --- | --- | --- | --- | --- |
| D-014 | 2026-11-04 | The store has two backends of equal rank: sqlite and jsonl. The configuration lives in `$XDG_CONFIG_HOME/memlens` and the data in `$XDG_DATA_HOME/memlens`. `MEMLENS_STORE` gives another data path. | The customer gave both backends the same rank and gave the XDG paths. | One backend only. A database server. | One store test for two backends. The JSONL backend needs the sidecar index. See [REQ-042](02-requirements.md). |
| D-016 | 2026-11-04 | A merge is a union of events by id. The projection converges for any order of arrival. | Two stores must merge without a coordinator. A union needs no clock order. | Last write wins. A vector clock. A central server. | The merge is simple and repeatable. A conflict rule for one id stays open. |
| D-049 | 2026-11-04 | `storeRev` is a counter that grows in the transaction of each edit in SQLite, and a fingerprint of the file in JSONL. The count of the events and the `pos` are not a version. | A view cache must see each change of the content, and two stores must not agree by accident. | The count of the events. The highest `pos`. | An edit that keeps the count of the events still changes the version. The JSONL backend reads the file. |
| D-071 | 2026-11-05 | The default export copies the whole store under an exclusive lock. The flag `--scope` writes one scope. An import unions the events by `id`. A payload conflict with one `id` gives no error: the later `at` wins, and an equal `at` keeps the local event. The events of a record with a `redact` arrive sanitized. | S-073 gives the rules. An error on a conflict stops a transfer. | An export by scope. An error on a payload conflict. The arrival order as the winner. | Two sessions of one store converge. A divergent payload resolves to the later `at`, and the log keeps both events. |
| D-072 | 2026-11-05 | The index port takes the query after the parse: the words, the words with `-`, the scopes, the kinds, `since`, `until`, `due`, and the limit. It limits the answer itself, and it gives the hits by `ts` from the newest, then by `pos` from the largest. | S-085 gives the hit, the transaction, and the tokenizer. The parse and the limit stay with the port. | The port takes the raw words. The caller limits by scope, kind, date, and `due`. The order by `pos` only. | The two backends share one query contract, and one test runs on both. A hit costs one row of the index, and no read of a record. |
