# 0001. Memory model

Status: accepted

## Context

An agent forgets between sessions, and a long chat is not the answer. The product needs a small map of facts, not a transcript. A vector search and an entity graph are out of scope.

## Decision

The memory is a log of curated notes. A tree of retellings is a cache above the notes. A catalog of cards is a second level, and one engine builds both trees.

## Alternatives

An infinite chat. A vector store. An entity graph with bitemporality.

## Consequences

Two levels share one engine. The catalog belongs to one profile. The tree is a cache, and the log is the truth.
