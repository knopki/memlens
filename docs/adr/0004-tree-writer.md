# 0004. Tree and writer

Status: accepted

## Context

The view must fit a budget, and a retelling costs a model call. The writer must not block the agent loop, and a crash must not lose a job.

## Decision

A binary tree over `pos` keeps the view under the budget. The fold merges built pairs by `due`, then `level`, then `start`. The writer runs outside the agent loop from a queue with a lease and a backoff. The store accepts a result only when `gen` matches the recorded `input_gen`.

- 0018: The project takes these parts of the prior art.
- 0019: The writer defaults follow the measurements.
- 0038: A node has the key `(level, start)`, and a node of level `L` covers `2^L` consecutive `pos` values with `start` a multiple of `2^L`.
- 0039: A summary line targets 512 bytes and stops at 640 bytes..
- 0040: The frontier lists the lines from the oldest to the newest.
- 0041: The rebuild follows the dirty marks.
- 0048: The fold takes a pair by `due` in descending order, then `level` in ascending order, then `start` in ascending order.
- 0054: The compaction runs outside the agent loop.
- 0059: A merge gives the model the two children only.
- 0067: The writer takes the provider of the model route when `provider` is empty.

## Alternatives

Build the view on each turn. One job at a time. Maintain the tree in the agent loop. No shrink check.

## Consequences

One change costs `log2(N)+1` model calls at most. The cache key is `epoch = hash(storeRev, sorted built nodes)`. The wake does not block on the queue.
