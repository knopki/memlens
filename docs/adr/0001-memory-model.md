# 0001. Memory model

Status: accepted

## Context

An agent forgets between sessions, and a long chat is not the answer. The product needs a small map of facts, not a transcript. A vector search and an entity graph are out of scope.

## Decision

The memory is a log of notes and of nodes. A node is a summary of two children, and the tree of nodes
is rebuildable from the log. A catalog of the same nodes is a second level, and one engine builds both
trees.

## Alternatives

An infinite chat. A vector store. An entity graph with bitemporality.

## Consequences

Two levels share one engine. The catalog belongs to one profile. The log is the truth, and each node
is rebuildable from it.
