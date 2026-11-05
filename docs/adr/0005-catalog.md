# 0005. Catalog

Status: replaced by 0011

## Context

The agent needs a map of directions, one for each scope. A card gives the state of a direction for a session. The text comes from a model, so the card is not a function of the store alone.

## Decision

The catalog is a log of cards above the notes, with one scope for each profile. A card is a `note` event with `kind: "card"`, `for_scope`, and `for_sources`. One card covers one scope and one session. A rebuild writes a new card with the old card in `supersedes`. The direction line is the live card.

## Alternatives

A separate card op. A card for each scope only. The store joins the bodies at each build. No catalog.

## Consequences

The catalog tree marks the ancestors of a rebuilt card dirty. A redaction sanitizes each card with the id in `for_sources`. The card text can differ between builds.
