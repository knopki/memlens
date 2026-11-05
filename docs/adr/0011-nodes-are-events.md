# 0011. Nodes are events

Status: accepted

## Context

The store is a log. The export and the import move events by `id`, and the JSONL backend writes
lines. A node holds a summary, and a rebuild replaces that summary. The earlier decision kept the
node out of the log, so a rebuild had no event to travel. A session is not a source of a node.

## Decision

A node is a `node` event. It holds `level`, `start`, `child_a`, `child_b`, `input_gen`, `summary`,
`bytes`, `truncated`, `ts_from`, and `ts_to`. Its `at` is the time of the build. The current node of
a key is the latest `node` event for that key in the projection order. A node is dirty when its
`input_gen` does not match the `gen` of its children, so the store keeps no state field. The queue of
the writer is the set of dirty nodes. The catalog is a tree of the same nodes in the scope
`__catalog__:<profile>`. Its leaves are the scope lines. One scope line covers one scope, and its
children are the two nodes of that scope which cover its range. The direction line is the scope line.

## Alternatives

A separate node table. A dirty flag in the store. A node outside the export. A node for one session.

## Consequences

A rebuild appends an event. The export carries the nodes, and the import unions them by `id`. A
changed child makes each node above it dirty, so a node of an imported store is never stale. A
redaction clears the summary of each node that covers the position. The log grows with each rebuild.
