# 0020. Storage pivot

Status: accepted. The code holds the row store. The pending items are in [06-architecture.md](../spec/06-architecture.md#remaining-work).

## Context

The event-sourced core replays the full history on every write and parses a projection blob on every read. Publication rewrites every event row on each change. The core counts about 8,700 lines. The product is a prototype with no users.

The owner called the event model overcomplex for fork, merge, import, and export at personal scale.

## Decision

- One SQLite database is the only backend. The JSONL backend dies. JSONL stays as the transfer format.
- Normalized mutable rows are the truth. No event log, no projection, and no replay cursor. A later change of the table shape migrates the store at open, in one transaction.
- Notes order by an immutable `(ts, id)` key. The slot is the rank in that order. Hidden and deleted notes keep their slots. The next allocation reuses a freed tail slot.
- Changes carry versions from one hybrid logical clock with the store identity as the tie-break. A local write after an import outranks the imported state.
- Sync merges five channels: content and review by version, lifecycle by maximum, cleared by latch, and the supersede link by first write.
- Node rows are cache entries guarded by validity keys. The write path deletes every node that covers a changed slot. The render gives children text until compaction rebuilds the node. A join of children that fits the line limit publishes with no model call.
- Search uses one external-content FTS5 table created with the FTS5 secure-delete option.
- Redaction is one transaction plus one truncating checkpoint, guarded by one byte test of the database file and the WAL.
- The audit journal holds no content and no hash, and never syncs.
- No revision counter, no scopes table, no fingerprints, and no numeric line budget. The package isolation test guards the shape, and the core exports no replay.

## Alternatives

Keep the event log and normalize its storage. The derivation cost and the replay stay.
Store events beside materialized rows. Two representations must stay in step on every path.
Use key-interval tree nodes without slots. This avoids the tail shift but rewrites the tree engine.

## Consequences

The CLI and the console read SQL rows. No whole-store view remains. The plugin is a scaffold, and it reads the same rows when its surface arrives. A backdated insert moves later slots, so a numeric address is not stable in time, and the console shows the date beside the position. Tombstones never expire, or an old export restores deleted content. Summaries rebuild per store. A file copy needs a new store identity, and [Q-515](../spec/03-open-questions.md#q-515) holds that open point. The directions block becomes a derived scope list with no stored catalog. The storage pivot refuses the requirements that name events, the cursor, the projection, or two backends. The storage pivot accepts REQ-521 to REQ-537.
