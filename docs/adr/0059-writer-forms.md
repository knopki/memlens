# 0059. Writer forms

Status: accepted

## Context

A shared prefix costs almost nothing on the prefix cache. A broken batch costs 6 nodes at once, so the fallback to `parallel` limits the loss.

## Decision

A merge gives the model the two children only. The form `parallel` gives its 6 calls one prefix of the context. The form `batch` writes up to 6 lines in the form `#a-b: line`, and a broken answer gives one retry with the error, then `parallel`. The form `auto` follows the family of the model. The writer makes 120 calls in one hour for one store at most.

## Alternatives

The form `parallel` only. The form `batch` only. No rate limit.

## Consequences

The cache keeps the parallel form cheap. A broken answer costs one more call. A call above the limit waits, and no work is lost.
