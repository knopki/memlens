# 0016. Write boundary

Status: accepted. The write boundary follows the accepted requirements. Idem leaves the event model. [0020 Storage pivot](0020-storage-pivot.md) removes the payload hash.

## Context

The event schema has no idem field. Earlier requirements still require that key.
The tool adapter and core run in one process. Content comparison already prevents duplicate live notes.
An import joins events by id. It needs no second identity.

## Decision

Remove idem from the active requirements. Keep content comparison for local note writes without supersedes.
A repeated request with supersedes has no separate retry guarantee.

Validate every incoming copy before conflict resolution. Reject fields outside the operation schema.
Normalize scope and body for local writes. Imported events must already satisfy their content limits.
Keep imported event values intact so validation does not change conflict hashes or event history.
UTC times use the fixed form YYYY-MM-DDTHH:mm:ss.sssZ. This form preserves the required lexical time order.
An import permits absent targets because a scope export can contain only part of a history.
Reject a known target of the wrong operation. Local writes require their targets to exist.

Canonical JSON sorts object keys by lexical order at every depth. It preserves array order and string values.
It uses JSON number and string encoding. It adds no whitespace or Unicode normalization.
Resolve copies by sanitized status, then at, then SHA-256 of canonical JSON, each in descending priority.
Apply redaction evidence from every copy, including losing copies, after conflict resolution.
Keep invalidation targets from every copy as evidence, including absent node targets in partial histories.
The planner emits additional invalidations for targets that conflict resolution removes from the final log.
This preserves permanent invalidation without a change to the event winner rules.

Pure plans return node targets grouped by their node scope. The caller supplies invalidation ids and times.
A local node publication preserves the new node and invalidates affected ancestors.
An import starts every new or changed node candidate unusable. An identical imported copy changes no node state.
The planner compares exact record inputs, old and new positions, scope roots, and catalog positions.
It includes historical candidates on affected paths. Unchanged branches retain their summaries.

## Consequences

The event schema needs no idem field. The domain path needs no file access or model calls.
The backend must run the plan under its write lock and publish data with the returned invalidations.
Persistent backends remain a later stage. The index port requires review before index implementation.
