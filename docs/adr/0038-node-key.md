# 0038. Node key

Status: accepted

## Context

A hide, a redact, an accept, and a lazy build make holes, and a dense prefix would rebuild the tree at each change.

## Decision

A node has the key `(level, start)`, and a node of level `L` covers `2^L` consecutive `pos` values with `start` a multiple of `2^L`. The tree needs no dense prefix.

## Alternatives

A dense prefix of the live positions. A child list without the `(level, start)` key.

## Consequences

A node keeps its range after an empty position. The frontier renders no empty position. An address stays stable after a hide.
