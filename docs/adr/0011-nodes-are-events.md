# 0011. Nodes are events

Status: replaced by [0020 Storage pivot](0020-storage-pivot.md)

## Context

The store is a log. The export and the import move events by `id`, and the JSONL backend writes
lines. A node holds a summary, and a rebuild replaces that summary. The earlier decision kept the
node out of the log, so a rebuild had no event to travel. A session is not a source of a node.

## Decision

A node is a `node` event. It holds `level`, `start`, `child_a`, `child_b`, `input_rev`, `summary`,
`chars`, `truncated`, `ts_from`, and `ts_to`. Its `at` is the time of the build. The current node of
a key is the latest candidate whose id has no invalidation. The store builds a clean node, and it has clean child nodes.
Its child revision must equal `input_rev`, but that equality alone does not prove freshness.
[0015 Node invalidation](0015-node-invalidation.md) defines the invalidation events and the writer check. The
writer computes dirty range candidates and stores no queue. The catalog is a tree of the same nodes in the scope
`__catalog__:<profile>`. One position holds one scope, and the content of the position is the top node
of the tree of that scope. The leaves of the catalog are these top nodes. The direction line is the
line of that top node.

Catalog positions derive from the resolved log and the scope filter of the profile.
The projection traverses source events in `(at, id)` order and increments its counter at the first real appearance of each scope.
A non-proposed note introduces its scope. An applied amend can introduce its destination scope through a record transfer.
Proposals, dismissals, nodes, and invalidations do not introduce scopes. A scope with no live note keeps its empty position.
A rebuild preserves this historical order, including scopes whose records later leave or lose their content.

An import merges events, not the counters of two stores. The projection derives positions again after the union.
The same resolved log and profile filter give the same positions in every arrival order.
An earlier scope appearance can shift positions. Invalidation covers the old and new catalog paths of changed leaves.
An unaffected prefix survives. The scope trees keep their own coordinates.

At a catalog leaf, the child id resolves through the scope assigned to that catalog position.
It names the current top node of that scope tree. The top node's own range does not determine its catalog position.
A scope with live records but no clean top node remains non-empty, and the catalog writer waits for that node.
No synthetic leaf event is necessary.

## Alternatives

A separate node table. A dirty flag in the store. A node outside the export. A node for one session.

## Consequences

A rebuild appends an event. The export carries the nodes, and the import unions them by `id`. A
changed child makes each node above it dirty, so a node of an imported store is never stale. A
redaction clears the summary of each node that covers the position. The log grows with each rebuild.
