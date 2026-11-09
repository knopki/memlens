# 0015. Node invalidation

Status: draft. See [Q-461](../spec/03-open-questions.md#q-461).

## Context

An import usually joins two tails after a common prefix. The unaffected branches must stay usable.
An imported summary does not need to survive. See [S-133](../statements.md#s-133).

The latest event order does not describe all the input of a summary. Consider notes at times 100 and 200.
A node takes the input revision 200. An imported amend at time 150 changes the first note.
The maximum stays 200, but the old summary is wrong.

The log is the only truth. A flag in the projection alone cannot preserve invalidation after a loss of that projection.

## Decision

The log form remains open. The proposed form is an explicit event that names the summaries that must stay unusable.
The proposal uses the existing child links and needs no hash of a range.

### Proposed event

```typescript
interface InvalidateEvent {
  readonly id: Ulid;
  readonly at: IsoTime;
  readonly scope: ScopeKey;
  readonly op: "invalidate";
  readonly targets: readonly Ulid[];
}
```

Each target names a `node` event. An invalidation changes no note and no earlier event.
It does not erase text. Redaction keeps its separate duty to erase text.

The projection keeps the target ids from the log. A target stays unusable in every arrival order.
The current node is the latest summary that is not a target of an invalidation.
If no candidate survives, the range has no usable summary.

### Import

The import compares the records before and after the union. It checks their ids, positions, visibility, and summary input.
A changed position affects its old and new ancestors. A change of a scope root also affects its ancestors in the catalog.

For each affected range, the import invalidates every old summary candidate that could render stale text.
This includes historical candidates, so an older summary cannot return as a fallback.
Each new imported candidate also starts unusable. The same id with the same payload is not a new candidate.
An unaffected local summary stays usable. This proposal does not reuse new imported summaries.

The import publishes its data changes and invalidations together. A read cannot see changed data with a usable stale summary.
The implementation must define this boundary for each backend before implementation of this proposal.
A repeated import that changes no event or payload writes no invalidation.

### Writer

A local change of summary input invalidates the affected summaries in the same write.
The writer takes two clean children and keeps their exact input for the duration of the job.
Before the append, the store compares both children with that input under the write lock or transaction.
It checks the child ids, positions, text, dates, and visibility. At level 1, it also checks the document previews.
A dirty child or a changed input rejects the result. An unchanged input permits the result.
A later change invalidates the new node in its own write.

No persistent copy of the input is necessary. The invalidation events preserve the result of each change.
The accepted design must replace the old `input_rev` check in the tree types and in REQ-209 and REQ-210.

## Alternatives

1. An explicit `invalidate` op. The log has eight ops, so this choice changes REQ-063.
2. A marker with `op: "node"`. The marker has no summary and means invalidation of a range.
   This choice keeps seven ops but adds a second form of a node event.

A hash of every range adds a mechanism that the customer did not select. A flag outside the log loses the durable cause.
A reset of the whole scope discards unaffected branches. The customer rejected that extent.

## Consequences

The common prefix survives a tail merge. An old imported amend invalidates its path even when the maximum event order stays unchanged.
A restart and a rebuild of the projection preserve the invalidation. A later build writes a new node id.

This proposal does not change the fold, the address rules, or the catalog positions.
The backend publication boundary remains part of Q-461. This draft does not close the first review finding.
