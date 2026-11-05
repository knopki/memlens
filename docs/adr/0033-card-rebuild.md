# 0033. Card rebuild

Status: accepted

## Context

The card text is a retelling, and an immutable log has no rewrite of an event.

## Decision

A rebuild of a card writes a new `note` event with the old card in `supersedes`. The log keeps the old card.

## Alternatives

Amend the card event. Erase the card and write it again.

## Consequences

The old card stays in the log, and the projection hides it. The catalog tree marks the ancestors dirty.
