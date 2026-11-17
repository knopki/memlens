# 0015. Node invalidation

Status: replaced by [0020 Storage pivot](0020-storage-pivot.md). See [Q-461](../spec/03-open-questions.md#q-461).

This decision replaces the freshness and writer checks of ADR 0013, ADR 0011, and ADR 0004.
Their other decisions stay in effect.

## Context

An import usually joins two tails after a common prefix. The unaffected branches must stay usable.
The store does not need to reuse a new imported summary.

The latest event order does not describe all the input of a summary. Consider notes at times 100 and 200.
A node takes the input revision 200. An imported amend at time 150 changes the first note.
The maximum stays 200, but the old summary is wrong.

The log is the only truth. A flag in the projection alone cannot preserve invalidation after a loss of that projection.

## Decision

An explicit `invalidate` event names the node ids whose summaries must stay unusable.
The event has no model call. Its shape was in `events.d.ts`.

### Projection

Each target names a `node` event. An invalidation changes no note and no earlier event.
It does not erase text. Redaction keeps its separate duty to erase text.

The projection derives the set of target ids from the log. A target stays unusable in every arrival order.
A rebuild collects this set before it selects node candidates. An incremental update applies invalidations before it selects new candidates.
The current node is the latest candidate whose id has no invalidation. Sanitized node events never become candidates.
If no candidate survives, the range has no current node.

A clean node must be built and have no invalidation. Each child node must also be clean.
The `input_rev` equality remains a check, but it is not proof of unchanged input.
The tree reads current records from the projection, including their state and latest mutation order.

### Import

The import compares the records before and after the union. It checks their ids, positions, visibility, and summary input.
A changed position affects its old and new ancestors. A change of a scope root also affects its ancestors in the catalog.

For each affected range, the import invalidates every existing summary candidate that could render stale text.
This includes historical candidates, so an older summary cannot return as a fallback.
Each new imported node candidate also starts unusable. The same id with the same payload is not a new candidate.
An unaffected local summary stays usable. This version does not reuse new imported summaries.

The import selects targets under the store write lock or transaction. That lock also covers publication of the data and invalidations.
An empty target set writes no event. The target ids have no duplicates.
A repeated import that changes no event or payload writes no invalidation.
An import returns its generated invalidation events in a later export, as it returns other log events.
Redaction also clears historical payloads, including imported summaries, before publication.
An import that clears stored content follows [0008 Redaction](0008-redaction.md) instead of the append-only publication steps below.

### Publication

The SQLite backend appends the invalidations and the data in one transaction. The same transaction changes the projection.

The JSONL backend holds one store lock from target selection through the append.
It appends and flushes complete invalidation lines before it appends any affected data line.
It then appends the data and changes the sidecar. A reader holds the same lock during recovery of that write.
A crash after invalidation can leave an unnecessary rebuild. It must not leave changed data with a usable stale summary.
Only complete log lines enter the projection. Recovery handles an incomplete final line before another append.

### Writer

A local change of summary input uses the same invalidation rule and publication order.
The writer takes live records or clean nodes and represents an empty half as null.
A job copies both halves as `BuildInput`. One empty half needs no model call, and two empty halves need no job.
The copy holds child ids, positions, text, dates, and the document previews that the call reads.
It holds no mutable reference to a record. It needs no persistent copy of the input.

Before the append, the store reads both children again under the write lock or transaction.
It rejects the result when a child is dirty, no longer live, or different from the copied input.
The same lock or transaction covers this check and the append. The old `input_rev` equality alone does not permit a result.
A later change invalidates the new node in its own write.

Two writers with the same unchanged input can both append. A changed child rejects a stale result.
The rebuilt node gets a new id, so an invalidation of an earlier node does not invalidate the new one.

## Alternatives

A marker inside a `node` event keeps seven ops but adds a second form of a node. The customer selected the explicit op.
A hash of every range adds a mechanism that this decision does not need.
A flag outside the log loses the durable cause. A reset of the whole scope discards unaffected branches.

## Consequences

The log has eight ops. The projection keeps the invalidated ids, and the export carries their events.
The common prefix survives a tail merge. An old imported amend invalidates its path even when the maximum event order stays unchanged.
A restart and a rebuild of the projection preserve the invalidation. A later build writes a new node id.

This decision does not change the fold, the address rules, or the catalog positions.
[0014 Store projection](0014-store-projection.md) defines the physical replay cursor and the rebuild after an earlier import.
Invalidation does not replace the deletion of content by redaction.
