# 0014. Store projection

Status: replaced by [0020 Storage pivot](0020-storage-pivot.md)

## Context

The log is the source of truth, and the store keeps many records. A hundred thousand records give two
hundred thousand rows of the tree. A read that derives the view from the events scans the whole log,
and a render happens on each turn.

An import can append an event whose `(at, id)` precedes the events that the projection already applied.
The event order cannot mark the end of a physical read. See [S-136](../statements.md#s-136).

## Decision

The store keeps a projection of the log: the records, the current node of each range, and the count of each scope.
It also derives the invalidated node ids from the log. See [0015 Node invalidation](0015-node-invalidation.md).

The projection holds a replay cursor. SQLite uses its local append sequence.
JSONL uses the byte offset immediately after the last complete line that the projection processed.
The cursor belongs to that local log. It is not `(at, id)`, a note position, or an export field.

The SQLite backend changes the projection and cursor in the append transaction.
The JSONL backend changes the sidecar after the append, so a read can find a gap.
It reads complete lines after the byte offset, regardless of their event times.
The sidecar commits the projection changes and cursor together. A failed update advances neither.

Replay applies new events in `(at, id)` order. A small ordered gap permits incremental replay.
An event before the applied order, or a changed payload of an existing event, requires a full projection rebuild.
A gap above 1 000 events also requires a rebuild. A repeated import with no change requires neither replay nor a rebuild.

A read uses a stable log boundary under the store lock or transaction. The cursor advances only through data that the projection processed.
A JSONL rewrite or replacement invalidates the earlier cursor. A cursor outside the file or off a complete line also requires a rebuild.
After a rebuild, the cursor marks the end of the complete log prefix that the rebuild processed.

A projection rebuild reads each event one time and applies the two-pass projection rules.
It preserves the log, node events, and invalidations. It calls no model and starts no summary rebuild by itself.
The existing invalidation rules still determine which summaries are usable. The render reads the projection and scans no event.

The projection holds the version of its schema, and the first version is 1. A change of the shape
migrates the projection, and the store does not rebuild it from the log. A migration is one
transaction, and a failed migration leaves the earlier version.

## Alternatives

A read from the log on each render. A projection in a separate file for both backends.
A projection that the writer builds in the background. A replay cursor based on `(at, id)`.
The last option misses older events that an import appends.

## Consequences

A read costs the lines of the view and not the events of the log.
A crash of the JSONL backend can leave a gap, and the next read repairs it.
An old imported event requires a projection rebuild, but it does not require a new model call.
A lost projection costs one pass over the log and no data. A schema change still uses a migration.
