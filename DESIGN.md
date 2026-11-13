# DESIGN.md - Memlens v2 Storage Design

Status: the authoritative design for the storage pivot. Supersedes the working
notes in PIVOT.md, REPORT-1 to REPORT-6, and PIVOT-SYNTHESIS.md as the decision
record. The prototype has no users, so no migration exists: the store starts as a
fresh file.

## 1. Summary

The event log dies. One SQLite database holds normalized mutable rows: the current
state is the truth, and nothing replays history to read or to write. Notes order by
an immutable `(ts, id)` key, a hybrid logical clock orders changes, five merge
channels resolve sync between two stores, summaries are cache rows guarded by
validity keys, and search runs on an external-content FTS5 index.

## 2. Terms

| Term | Meaning |
| --- | --- |
| Note | One stored record: body, kind, scope, metadata |
| Scope | `profile:project` key. A scope exists while it has note rows |
| Order key | `(ts, id)` of a note. Immutable: an amend never changes `ts` |
| Slot | Integer position of a note inside its scope, one per rank in key order |
| Node | Stored summary row that covers the slot range `[start, start + 2^level)` |
| Validity key | The child token a node stores: leaf slots give `v_content\|state`, node children give `built_v` |
| Version | HLC text `physical\|counter\|store_id`. Sortable, ties impossible |
| store_id | One ULID in `meta`. Identifies the writer of each version |
| Channel | One mergeable field group of a note. Five exist |
| Tombstone | A deleted note row. Keeps id, ts, state, versions. Holds no content |
| Clock | The last issued version, in `meta`. Also the change epoch |

## 3. Schema

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA secure_delete = ON;      -- every connection, every process
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
-- rows: schema_version, store_id, clock, fts_tokenizer

CREATE TABLE notes (
  n             INTEGER PRIMARY KEY,    -- rowid, the FTS content rowid, stable
  id            TEXT NOT NULL UNIQUE,   -- ULID, the cross-store identity
  scope         TEXT NOT NULL,
  pos           INTEGER NOT NULL,       -- slot: rank in (ts, id) order of the scope
  state         TEXT NOT NULL CHECK (state IN ('live','hidden','deleted')),
  cleared       INTEGER NOT NULL DEFAULT 0 CHECK (cleared IN (0,1)),
  kind          TEXT NOT NULL CHECK (kind IN ('decision','preference','fact','task','note')),
  body          TEXT NOT NULL DEFAULT '',
  longform      TEXT,
  refs          TEXT NOT NULL DEFAULT '[]',        -- JSON array, opaque strings
  superseded_by TEXT,                             -- note id of the first winner
  ts            TEXT NOT NULL,           -- content date of the note, never changes
  created_at    TEXT NOT NULL,           -- wall clock of the row creation
  modified_at   TEXT NOT NULL,           -- wall clock of the last content or lifecycle write
  review_at     TEXT,                    -- next review time
  reviewed_at   TEXT,                    -- wall clock of the last review write
  session       TEXT NOT NULL DEFAULT '',
  turn          TEXT NOT NULL DEFAULT '',
  preset        TEXT NOT NULL DEFAULT '',
  v             TEXT NOT NULL,           -- HLC of the last touch
  v_content     TEXT NOT NULL,           -- HLC of the last content change
  v_review      TEXT,                    -- HLC of the last review change
  CHECK (cleared = 0 OR (state = 'deleted' AND body = '' AND longform IS NULL)),
  UNIQUE (scope, pos)
);
CREATE INDEX notes_order ON notes (scope, pos);
CREATE INDEX notes_dedupe ON notes (scope, body) WHERE state = 'live';
CREATE INDEX notes_due ON notes (review_at)
  WHERE state = 'live' AND review_at IS NOT NULL;

CREATE TABLE nodes (
  scope   TEXT NOT NULL,
  level   INTEGER NOT NULL CHECK (level >= 1),
  start   INTEGER NOT NULL CHECK (start % (1 << level) = 0),
  summary TEXT NOT NULL,               -- model text, or a published join text
  ts_from TEXT NOT NULL,               -- ts of the first live leaf, chained at build
  ts_to   TEXT NOT NULL,               -- ts of the last live leaf, chained at build
  built_v TEXT NOT NULL,               -- version of the build, for priority and checks
  a_key   TEXT,                        -- left child validity key. NULL half = no live note
  b_key   TEXT,
  PRIMARY KEY (scope, level, start)
) WITHOUT ROWID;

CREATE TABLE proposals (
  id         TEXT PRIMARY KEY,         -- ULID of the proposed write
  scope      TEXT NOT NULL,
  op         TEXT NOT NULL,            -- note | amend | hide | review
  target     TEXT,
  payload    TEXT NOT NULL,            -- the proposed change, JSON
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,            -- created_at plus 30 days
  closed     INTEGER NOT NULL DEFAULT 0, -- 0 open, 1 accepted, 2 dismissed, 3 expired
  CHECK (closed = 0 OR payload = '')
) WITHOUT ROWID;

CREATE TABLE journal (
  seq    INTEGER PRIMARY KEY AUTOINCREMENT,
  at     TEXT NOT NULL,
  store  TEXT NOT NULL,                -- acting store_id; the source store for import facts
  op     TEXT NOT NULL,                -- note, amend, hide, redact, review, move,
                                       -- supersede, accept, dismiss, expire,
                                       -- import, export, merge_lost, repair, ...
  target TEXT,
  scope  TEXT,
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 200)
);

CREATE VIRTUAL TABLE fts USING fts5(
  body, longform,
  content = 'notes', content_rowid = 'n',
  tokenize = 'porter unicode61 remove_diacritics 1'   -- trigram for zh and ja
);
INSERT INTO fts(fts, rank) VALUES ('secure-delete', 1);
```

There is no scopes table and no revision counter. A scope exists while it has note
rows; the next slot is `MAX(pos) + 1` through the order index. The clock value in
`meta` is the change epoch, and `PRAGMA data_version` covers cross-process polling.
Structural rules live in `CHECK` constraints. No behavioral triggers: every write
path goes through one publish function, which keeps the index, the nodes, and the
journal in step and logs each step.

## 4. Versions: the hybrid logical clock

A version is `physical(13 digits)|counter(6 digits)|store_id`. Text comparison is
the total order. `meta.clock` holds the last issued version.

- A local write ticks: `physical = max(now, clock.physical)`; the counter grows
  when events share one millisecond. The result persists in the same transaction.
- An import receives: `clock = max(clock, every incoming version)`. A local write
  made after an import outranks everything imported, whatever the wall clock says.
- `physical` keeps versions human-readable and roughly wall-ordered. For
  correctness `counter|store_id` would suffice.
- `store_id` is one ULID minted at store creation. It breaks version ties, names
  the actor in journal facts, and detects copied files: a copy must run
  `memlens store new-id` or two stores extend one identity.
- Wall time serves display fields and review scheduling. It never decides a merge.

## 5. Merge channels

| Channel | Fields | Merge rule |
| --- | --- | --- |
| Content | scope, kind, body, longform, refs, ts, session metadata | Last writer wins by `v_content` |
| Lifecycle | live < hidden < deleted | Join to the maximum. No version decides |
| Cleared | `cleared` | Latch: OR. A cleared side clears the content columns and re-stamps `v` forward, so the erasure outruns a losing amendment on the next hop |
| Review | `review_at`, `reviewed_at` | Last writer wins by `v_review` |
| Supersede link | `superseded_by` | First link wins. A merge never removes it |

A write that carries a supersede list validates the targets, stamps each target
`superseded_by` and `state = 'hidden'`, and discards the list. The list is not
stored: its effect travels inside the rows it changed. Consequences: an old export
cannot unhide or undelete a note, a redaction beats a younger amendment on every
later hop, and a review never discards a body edit.

## 6. Order and slots

- The order authority is the immutable key `(ts, id)`. `ts` is the content date
  and can be any date. A note never changes its place in the sequence.
- `pos` is the slot: the rank of the note in the order-key sequence over all note
  rows of its scope, in any state. `UNIQUE (scope, pos)` guards it.
- A note with the newest key lands at the tail slot. A note with an older key
  lands between its neighbors: one `UPDATE notes SET pos = pos + 1 WHERE scope = ?
  AND pos >= ?` shifts the tail, and the nodes over the shifted range are deleted
  in the same transaction. An import sorts its batch by key and shifts once.
- A scope move (an amend with a new scope) inserts the note at its key rank in the
  destination and frees the source slot. A freed tail slot is reused: the next
  allocation is `MAX(pos) + 1`.
- Hidden, deleted, and cleared notes keep their slots. Their rows must stay as
  sync evidence, and renumbering per hide would make the frequent path as costly
  as the rare backdated path. A hidden note in a range is an empty half, not a
  hole in the arithmetic.
- Consequence, same as v1: a backdated insert moves the slots of later notes, so
  a numeric address is not stable in time. The console shows the date beside the
  position. A scope with no live note gives no line in the interface.

## 7. Write path

One function owns `BEGIN`. Every published change is one `BEGIN IMMEDIATE`
transaction that reads what it needs, writes the rows, maintains `fts`, deletes
covering node rows, appends the journal fact, and ticks the clock. A write that
changes no row does not tick.

| Operation | Effect on `notes` |
| --- | --- |
| note | Dedup check through the live partial index on `(scope, body)`: compare body, longform, kind, review_at. A duplicate writes nothing. An input with a supersede list skips dedup. Otherwise insert at the key rank |
| amend | Update the content group, new `v_content`, `modified_at`. A scope change moves the row at its key rank |
| hide | `state = 'hidden'`, new `modified_at` |
| redact | See section 10 |
| review | `review_at`, `reviewed_at`, new `v_review`. Moves neither `modified_at` nor the node rows |
| supersede | Stamp each target: `state = 'hidden'`, `superseded_by = <id>`, and drop its FTS row |

After any change of content, lifecycle, scope, or slot of a note, the transaction
deletes every node whose range covers a changed or shifted slot:

```sql
DELETE FROM nodes WHERE scope = :scope
  AND start <= :pos AND :pos < start + (1 << level);
```

One statement per slot, at most `log2(scope size)` rows. A tail shift deletes the
nodes over the whole shifted range in one statement. Deletion must propagate at
write time: a descendant change does not move the `built_v` of an unbuilt child,
so read-time keys alone cannot see it without a recursive walk, which the design
forbids.

## 8. Summaries

A node row is a cache entry, not state. One row per `(scope, level, start)`.

- A node stores, for each half, the validity key of the child at build time: a
  leaf half stores `v_content|state` of the slot occupant, a node half stores the
  `built_v` of the child row, a NULL key means the half had no live note.
- `ts_from` and `ts_to` are the ts of the first and last live leaf, chained from
  the children at publication. Deriving them at read would walk every leaf, which
  is the work the summary exists to avoid.
- The write path keeps the tree consistent by deletion (section 7). The read keys
  are the second guard, for missed paths, imports, and damaged files. Repair runs
  one transitive validation walk offline.

### Rendering one range

1. A valid node row exists: render its `summary`.
2. No valid row, and the rendered texts of both children fit the line limit whole:
  render the concatenation. This is the join, and it publishes as a node row in
  the same transaction, with no model call.
3. Otherwise the range needs compaction. Until compaction runs, render a
  temporary concatenation of the children cut to the limit. If the children also
  lack rows, walk to the leaves. The walk is linear in the displayed content and
  exists only while compaction lags, as in v1.

A render never calls a model and never waits. The slice is the frontier: a
budgeted mixed-level set of ranges from the oldest to the newest.

### Validity at read

A node renders only when all three hold:

1. Each non-NULL leaf half: the slot occupant has the stored `v_content|state`.
2. Each non-NULL node half: the child row exists with the stored `built_v`.
3. Each NULL half: no live note exists in the half range, by an indexed check.
   This catches a backdated insert into a half that was empty at build.

### Compaction

- Candidates are ranges of the covered area with no valid node row. There is no
  job queue: `memlens compact` or the agent derives candidates on demand.
- Priority: older `built_v` first. `built_v` serves priority and diagnostics
  only, never correctness.
- Build: read the children and their keys in one read transaction, call the model
  outside any transaction, publish only if both keys still match.
- Nodes never sync. Each store builds its own tree. Bootstrap a second machine by
  copying the file and running `store new-id`.

## 9. Search

External-content FTS5 over `notes`: the index holds terms and doclists, the text
lives in the note rows. Delete and update use the FTS5 commands with the old values
by rowid. Query results join `notes` for scope, state, kind, and times.

- Order: `rank, ts DESC, scope, id`. The record id is the final tie-break key.
- The query grammar keeps the escaped prefix phrases of today.
- A trigram tokenizer serves zh and ja. A query shorter than three characters falls
  back to a bounded literal scan of live rows.
- The tokenizer stored in `meta` is authoritative. A language change is one
  explicit step: `memlens config set language <key>` (or `memlens repair` on a
  detected mismatch) drops and recreates the table, rebuilds it from notes, and
  updates `meta`, all in one transaction. A plain open with a config mismatch logs
  a warning and keeps the stored tokenizer.

## 10. Redaction

Setup on every open: `secure_delete = ON`, `temp_store = MEMORY`, `busy_timeout`.
The FTS table carries the FTS5 `secure-delete` option.

One transaction: set `deleted`, `cleared = 1`, `body = ''`, `longform = NULL`;
delete the FTS row; delete covering node rows; delete proposals that carry the
target; journal fact with the reason. After the commit,
`wal_checkpoint(TRUNCATE)`. The same truncate runs at open, at close, and after an
import that applies cleared rows. A busy result retries on the next open.

One test guards the claim: redact a note with a unique marker, checkpoint, scan the
raw bytes of the database file and the WAL for the marker. It is the arbiter for
the FTS flavor; if tokens survive, add one `optimize` line to the redact path.

Limits: exported files, filesystem blocks, SSD wear leveling, and the peer store
before it syncs are outside the store. The journal reason is the operator's own
text and is not redacted.

## 11. Transfer format

Full-state JSONL. Line 1 is a header: format version, store_id, last version. Then
one line per note in `(scope, pos)` source order, then a trailer with counts and a
digest. Proposals, nodes, slots, and the journal never travel. Deleted notes travel
as tombstones: id, ts, state, versions, `cleared`. No content, no slot.

Import runs one transaction for the whole file:

1. Parse and validate the complete input in memory, with explicit field and row
   limits. Reject duplicate ids inside the file.
2. Sort the batch by `(scope, key)` and `BEGIN IMMEDIATE`. For each note line,
   against the local row by id:
   - Absent: insert at the key rank, with one tail shift.
   - Present: apply the five channels. A changed row rewrites content, moves scopes
     at the key rank, syncs the FTS row, and journals a `merge_lost` fact when a
     local channel lost.
3. Delete the node rows over every changed or shifted slot, as section 7 does.
4. `clock = max(clock, incoming)`. Write one import fact if any row changed.
   Commit.
5. If any cleared row applied, run the truncate checkpoint after the commit.

The merge is commutative, associative, and idempotent on note rows. `--dry-run`
runs everything, reports conflicts and losses, and rolls back. Incremental export
is a filter, `WHERE v > :since`, on the same rows.

## 12. Proposals

A proposal is a local row with a payload and a thirty-day expiry. Acceptance checks
expiry, scope permission, and target state, applies the operation through the
ordinary write path, and closes the row in one transaction. Dismissal only closes.
Expiry is a lazy sweep at open and at write, with no timers. A closed row keeps no
payload. A redact deletes open proposals that carry the target.

## 13. Audit journal

Local facts, no content, no hashes: op, target, scope, acting store, short reason.
For an import fact, `store` names the source store of the file. The journal never
syncs, and no state path reads it. Retention is configuration: the default is 365
days and 50,000 rows, pruned inside a write at most once per 1,000 writes.

## 14. Read models

Reads query SQL. No per-open view and no whole-store projection exists.

| Model | Query |
| --- | --- |
| Note by address or id | One row by `(scope, pos)` or `id` |
| Slice | The frontier: budgeted mixed-level ranges, rendered by section 8 |
| Due reviews | The partial index |
| Live counts | `GROUP BY scope` |
| Search | FTS join notes |
| Directions | Derived catalog, below |

Directions: the visible scopes of the profile arrive from config as a render
parameter. The store lists scopes by `MAX(modified_at)` over live notes, takes the
N newest within the budget, renders them oldest to newest as `[key] <age> <summary>`
with the scope top line, and puts every older scope before them as one
comma-separated list of keys. A scope with no live note gives no line.

The context epoch is the clock value. Long-lived consumers poll `meta` or
`PRAGMA data_version` and refetch on change. No process holds a read transaction
across an await.

## 15. Concurrency and crashes

Writers: `BEGIN IMMEDIATE` inside the one publish function, `busy_timeout = 5000`.
Reads: one statement, or a short `BEGIN DEFERRED`. Checkpoints: automatic at 1,000
pages, truncate at open, close, redact, and cleared import. No daemon, no lock
file.

| Crash point | Holds | Repair |
| --- | --- | --- |
| Inside a transaction | Nothing of the change is visible | SQLite rollback |
| After redact commit | Content cleared, WAL may hold old frames | Truncate at next open |
| Inside an import | The whole import is absent | Re-run the file, idempotent |
| After a model call | Nothing published | Rebuild |
| Inside a checkpoint | Database consistent | Checkpoint is idempotent |

An old event-store file found at open is refused with a message that names the
action: move the file away. The prototype keeps no compatibility path.

## 16. Invariants

| Id | Fact |
| --- | --- |
| 1 | Every published change is one transaction: rows, FTS, node deletes, journal, clock |
| 2 | `(scope, pos)` is unique and equals the `(ts, id)` rank over all rows of the scope |
| 3 | No node row survives the transaction that changes a covered slot |
| 4 | A rendered line comes from a valid node, or from children text, never from a stale summary |
| 5 | `cleared = 1` implies empty body, NULL longform, no FTS row, under every merge order |
| 6 | Lifecycle never moves backwards: no path restores live |
| 7 | Import is idempotent: the second run changes nothing |
| 8 | Two stores converge after a full exchange, note rows identical |
| 9 | A point write reads a constant number of rows, with the tail shift and the node deletes as the stated exceptions |
| 10 | The journal holds no content and no hash |
| 11 | After redact and checkpoint, the marker bytes are absent from both files |
| 12 | The core imports no CLI, UI, or plugin package |

## 17. Complexity guards

No numeric line budget. Three property tests hold the line: the core exports no
`project`, `replay`, or `invalidate`; a point write reads a constant number of rows
(invariant 9); the isolation test extends to `domain` imports no `storage`.
Compactness stays a review discipline, measured against the 1,000-line
predecessor.
