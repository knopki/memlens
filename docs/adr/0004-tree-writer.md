# 0004. Tree and writer

Status: accepted. [0020 Storage pivot](0020-storage-pivot.md) replaces the projection and the node events.

## Context

The view must fit a line budget. A retelling costs a model call. The writer must not block the agent
loop. The log is durable, but a derived work list is not. [S-142](../statements.md#s-142) replaces
the earlier rules for the half-budget fold, the blocking render, and persisted work.

## Decision

A binary tree over `pos` keeps the view under the budget. The fold merges the minimum number of
pairs. It runs only while the rendered line count exceeds the budget. It stops at once when the
count fits. A node without a clean summary gives a temporary line with its dates and no text. The
render calls no model and waits for no writer.

The writer runs outside the agent loop. It derives build candidates from the projection. A candidate
is a dirty non-empty power-of-two range up to the root. A range with no node event is a candidate.
The writer uses the existing order: `due`, then level, then start. This list has no persistence.

Local in-flight work and a retry backoff are ephemeral. The existing backoff is 10 seconds, then 60
seconds, then 300 seconds. A restart clears each local value. The existing settings stay:
`provider`, `model`, `effort`, `mode`, `batch`, and `maxCallsPerHour`. The triggers remain: the
candidate count reaches `writer.batch`, no event arrives for `store.idle` seconds, and
`memlens compact` runs. `store.idle` is a number of seconds with a default of 300.

Two writers can build one range at one time. The store compares both exact child inputs under the
write lock or transaction before it appends a result. A changed input rejects the result. The store
accepts both results when each result passes the check.
See [0015 Node invalidation](0015-node-invalidation.md).

## Alternatives

Build the view on each turn. Keep the tree in the agent loop. Use one writer call at a time. No
shrink check.

## Consequences

One change costs `log2(N)+1` model calls at most. The cache key is `epoch = hash(storeRev, sorted
built nodes)`. The render reads the projection and returns at once. A restart derives the candidates
from the log and needs no saved work state. Each accepted result follows the exact-input check.
