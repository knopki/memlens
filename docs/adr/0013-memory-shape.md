# 0013. Memory shape

Status: accepted

## Context

The customer gave the product shape. A chat history costs tokens and loses the old facts.

## Decision

The memory is a log of curated notes with a tree of retellings above them. The notes are the leaves. A catalog of cards is the level above the notes. One engine builds both trees.

## Alternatives

An infinite chat. A vector search over a document store. An entity graph.

## Consequences

Two levels on one engine. The catalog is per profile. The shape of the tree stays open. See [Q-021](03-open-questions.md#q-021).
