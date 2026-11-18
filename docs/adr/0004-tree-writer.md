# 0004. Tree and writer

Status: accepted. [0023 Batch compaction](0023-batch-compaction.md) replaces the run forms.

## Context

The view must fit a line budget. A retelling costs a model call. The compaction must not block the
agent loop. A derived work list is not durable.

## Decision

A binary tree over `pos` keeps the view under the budget. The fold merges the minimum number of
pairs. It runs only while the rendered line count exceeds the budget, and it stops at once when the
count fits. A range without a valid node gives a temporary line with its dates and no text. The
render calls no model and waits for no compaction.

The compaction runs outside the agent loop. It derives the candidates from the dirty non-empty
ranges up to the root. A range with no node row is a candidate. The store keeps no queue, no job
row, and no lease. The order is `due`, then the level, then the start.

Local in-flight work and a retry backoff are ephemeral: 10 seconds, then 60 seconds, then 300
seconds. A restart clears each local value. The settings are `provider`, `model`, `effort`, `batch`,
and `maxCallsPerHour`, and the section accepts no key `mode`. See 0023. The triggers are the batch
count of waiting work, the idle time `store.idle`, the command `memlens compact`, and the start of
the plugin worker.

Two attempts can build one range at one time. The store compares both exact child inputs under the
write lock before it publishes a result. A changed input rejects the result.

## Alternatives

Build the view on each turn. Keep the tree in the agent loop. One attempt at a time. No shrink
check.

## Consequences

The render reads rows and returns at once. A restart derives the candidates again and needs no saved
work state. Each accepted result follows the exact-input check. A line that is not shorter than its
input stays open for a later attempt.
