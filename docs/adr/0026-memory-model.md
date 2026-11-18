# 0026. Memory model

Status: accepted. This record replaces 0001.

## Context

An agent forgets between sessions, and a long chat is not the answer. The product needs a small map
of durable records, not a transcript. A vector search and an entity graph are out of scope.

## Decision

The memory is a set of notes. One note holds a body and a longform document. The body is the leaf of
a tree, and the longform reaches the agent only through `memory_open`.
A scope exists only as a value on its notes, and the store holds no row for it.
The slot of a note is the rank of its key over the notes of its scope.
A node is one summary row over an aligned range of slots, and the tree is the set of nodes over one
scope. The store keeps one SQLite database. The rows are the truth, and the tree is a cache. See
0020.

## Alternatives

An infinite chat. A vector store. An entity graph with bitemporality. One tree for all scopes. A
stored catalog of scopes.

## Consequences

The tree is a cache, and the store rebuilds a node from its children. A numeric address is not
stable in time, and the agent reads the rendered context. A scope needs no registration, so a new
key works after one write.
