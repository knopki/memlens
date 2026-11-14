# 0017. Store publication

Status: replaced by [0020 Storage pivot](0020-storage-pivot.md)

## Context

The domain returns a complete event union and invalidation targets. Separate processes need one publication boundary.
JSONL has no transaction that spans several event lines and its sidecar.

## Decision

Keep domain preparation inside the backend lock. Publish source events and generated invalidations together.
SQLite commits events, the projection, its local cursor, and a revision counter in one transaction.
JSONL writes a temporary source, flushes it, replaces the source, and flushes the directory.
It then writes the projection and byte cursor into its sidecar. Recovery completes that cache before any read.
A separate SQLite file supplies the JSONL process lock. The operating system releases this lock after process death.
The lock file remains independent of the disposable sidecar.

Check exact copied children before node publication under the same lock. Reject ordinary node append calls.
Keep publication logs immediately before and after the durable boundary. Logs contain no content.

## Alternatives

Append several JSONL lines independently. A process exit could expose data without its invalidations.
Use a lock directory with a process id. This requires stale lock recovery and process identity checks.
Use one storage framework. Two small backends need no additional lifecycle abstraction.

## Consequences

Both backends pass the same process and failure tests. The source remains authoritative after cache failure.
JSONL currently replaces the complete source for each change. It rebuilds the projection when the source fingerprint changes.
This favors a small implementation over incremental replay. Large histories require later performance work under the pending replay requirements.
Without a trusted sidecar, recovery checks local file prefixes for missing invalidations. This fallback can require quadratic work.
SQLite erasure uses secure deletion and WAL truncation. A blocked checkpoint reports failure after the source transaction commits.
A later open repeats that cleanup. Existing session history remains unchanged.
The index port accepts complete projected records and returns full hits. FTS5 implementation remains pending.
