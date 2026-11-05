# 0048. Fold order

Status: accepted

## Context

A batch keeps the view as a prefix extension, so the prompt cache of the model survives.

## Decision

The fold takes a pair by `due` in descending order, then `level` in ascending order, then `start` in ascending order. It works in batches from `high` down to `low`.

## Alternatives

One merge for each turn. The newest pair first.

## Consequences

The old end of the log compresses first. A view above `high` shrinks to `low`.
