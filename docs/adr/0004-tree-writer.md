# 0004. Tree and writer

Status: accepted

## Context

The view must fit a budget, and a retelling costs a model call. The writer must not block the agent loop, and a crash must not lose a job.

## Decision

A binary tree over `pos` keeps the view under the budget. The fold merges built pairs by `due`, then `level`, then `start`. The writer runs outside the agent loop from a queue with a lease and a backoff. The store accepts a result only when `gen` matches the recorded `input_gen`.

## Alternatives

Build the view on each turn. One job at a time. Maintain the tree in the agent loop. No shrink check.

## Consequences

One change costs `log2(N)+1` model calls at most. The cache key is `epoch = hash(storeRev, sorted built nodes)`. The wake does not block on the queue.
