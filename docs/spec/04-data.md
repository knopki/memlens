# Data model

The store holds one SQLite database. Current rows are the truth. No event log, no projection, and no
replay cursor exists. See [0020 Storage pivot](../adr/0020-storage-pivot.md).

The [schema contract](../../packages/core/src/store/schema.ts) owns the tables. This file gives the
model that more than one module depends on.

## Tables

| Table       | Holds                                                                 |
| ----------- | --------------------------------------------------------------------- |
| `meta`      | `schema_version`, `store_id`, `clock`, and `fts_tokenizer`.           |
| `notes`     | One row for each note, in any state. The content lives here.          |
| `nodes`     | One summary row for each aligned range of slots. It is a cache.       |
| `proposals` | One local row for each proposed change and its decision.              |
| `journal`   | Local facts about writes. It holds no content and no hash.            |
| `fts`       | The external-content search table over `body` and `longform`.         |

Every connection sets the write-ahead log, `synchronous = FULL`, `secure_delete = ON`,
`busy_timeout = 5000`, and `temp_store = MEMORY`. The search table carries the FTS5
`secure-delete` option.

The `notes` table holds one unique key `(scope, pos)`, one partial index on `(scope, body)` for live
rows, and one partial index on `review_at` for live rows with a review time.

## Field groups

A note row has these groups:

| Group     | Fields                                                        |
| --------- | ------------------------------------------------------------- |
| Content   | `scope`, `kind`, `body`, `longform`, `refs`, `ts`, and session fields |
| Lifecycle | `state`, in the order `live`, `hidden`, `deleted`             |
| Cleared   | `cleared`, the latch of a redaction                           |
| Review    | `review_at` and `reviewed_at`                                 |
| Link      | `superseded_by`                                               |
| Times     | `created_at` and `modified_at`, the wall clock of the row     |
| Versions  | `v`, `v_content`, and `v_review`                              |

A deleted row is a tombstone. It keeps the id, the scope, the slot, the date, the state, and the
versions. It holds no content.

## Order and slot

The order key is the immutable pair `(ts, id)`. The slot is the rank of that key over all note rows of
the scope, in any state. The unique key `(scope, pos)` guards the slot.

An insert into the middle shifts each later slot by one. The next note reuses a freed tail slot, and the next allocation is `MAX(pos) + 1`. A hidden, deleted, or cleared note keeps its slot, because an old
export must not restore the content.

An amend that moves a note to another scope inserts the row at its key rank in the destination and
frees the source slot.

## Versions

A version is the text `physical|counter|store_id`. The physical part has 13 digits and the counter has
6 digits, so text order equals numeric order. `meta.clock` holds the last issued version.

The clock never decreases. A local write takes the greater of the wall clock and the stored physical
part, and the counter grows inside one millisecond. An import raises the clock above each incoming
version, so a local write after an import outranks the imported state. The store identity breaks each
tie. Wall time never decides a merge.

## Merge channels

| Channel  | Fields                                    | Rule                          |
| -------- | ----------------------------------------- | ----------------------------- |
| Content  | the content group and the session fields  | Last writer wins by `v_content` |
| Lifecycle | `state`                                  | Join to the maximum           |
| Cleared  | `cleared`                                 | Latch, with a forward `v`     |
| Review   | `review_at`, `reviewed_at`                | Last writer wins by `v_review` |
| Link     | `superseded_by`                           | First write wins              |

The channels make a merge commutative, associative, and idempotent. An old export cannot unhide or
undelete a note. A redaction beats a younger amendment on each later exchange. A review never
discards a body edit.

## Summary rows

A node row covers the slot range `[start, start + 2^level)` of one scope. It stores the summary and
one validity key for each half.

A leaf half stores `v_content|state` of the slot occupant. A node half stores the `built_v` of the
child row. A null key means that the half held no live note at the build.

A node renders only when each non-null half matches its row and each null half holds no live note.
A write path deletes each node over a changed slot in the same transaction, so a render never gives a
stale summary. A range without a valid node gives the text of its children. The join publishes as a
node row when the two child texts fit the line limit.

Compaction candidates are the non-empty ranges without a valid node. The store keeps no queue. A
model call runs outside the transaction, and the publish compares both child keys again.

## Redaction

A redact is one transaction. It sets `deleted` and `cleared = 1`, empties the body, and clears the
`longform`. It deletes the index row, the covering node rows, and the proposals that carry the target.
It writes one journal fact. A truncating checkpoint follows the commit.

One test proves the erasure. Redact a note with a unique marker, then checkpoint. The test scans the raw bytes of the database file and the log.

## Transfer

The transfer format is JSONL of the complete note state. Line one is a header with the format, the
store identity, and the last version. Then one line for each note in `(scope, pos)` order. The last
line is a trailer with the count and a digest.

Proposals, node rows, slots, and the journal never travel. A tombstone travels with no content.

The import validates the complete file before the first write, then runs one transaction. It applies
the five channels by `id`. A repeated import of one file changes no row. The option `--as` gives the
batch another scope, and `--dry-run` reports the changes and writes nothing.

## Retention

The command `repair` prunes the journal to 365 days and 50 000 rows. A proposal expires after thirty
days. The command `accept` refuses an expired proposal.

## Guarantees

| Guarantee                                                                 | Test                              |
| ------------------------------------------------------------------------- | --------------------------------- |
| A published change is one transaction: rows, index, node deletes, journal, and clock | The store tests |
| The slot equals the `(ts, id)` rank over the scope                         | `store-seams.test.ts`             |
| No node row survives a change of a covered slot                           | `store-build.test.ts`             |
| A render gives a valid node or the text of its children                   | `view-slice.test.ts`              |
| A cleared row holds no content and no index row                           | `store-notes.test.ts`             |
| No path restores a deleted note                                           | `store-transfer.test.ts`          |
| A repeated import changes no row                                          | `store-transfer.test.ts`          |
| Two stores converge after a full exchange                                 | `store-transfer.test.ts`          |
| The journal holds no content and no hash                                  | `store-proposals-repair.test.ts`  |
| A redacted marker is absent from the database file and the log            | `store-notes.test.ts`             |
| The core imports no CLI, UI, or plugin package                            | `isolation.test.ts`               |

A point write reads a bounded number of rows. The tail shift and the node deletes are the stated
exceptions.
