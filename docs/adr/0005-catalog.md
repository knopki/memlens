# 0005. Catalog

Status: accepted

## Context

The agent needs a map of directions, one for each scope. A card gives the state of a direction for a session. The text comes from a model, so the card is not a function of the store alone.

## Decision

The catalog is a log of cards above the notes, with one scope for each profile. A card is a `note` event with `kind: "card"`, `for_scope`, and `for_sources`. One card covers one scope and one session. A rebuild writes a new card with the old card in `supersedes`. The direction line is the live card.

- 0022: A catalog card is a `note` event with `kind: "card"`, `for_scope`, and `for_sources`.
- 0033: A rebuild of a card writes a new `note` event with the old card in `supersedes`.
- 0034: The catalog has one scope for each profile: `__catalog__:<profile>`.
- 0035: A card becomes dirty after a change of a source, and the store rebuilds it from the live records that stay..
- 0037: A card carries `body`, `kind`, `ts`, `session`, `for_scope`, and `for_sources`, and no `review_at`, `proposed`, `turn`, or `preset`..
- 0053: The body of the card is the answer of the model, and the limit is 512 bytes.

## Alternatives

A separate card op. A card for each scope only. The store joins the bodies at each build. No catalog.

## Consequences

The catalog tree marks the ancestors of a rebuilt card dirty. A redaction sanitizes each card with the id in `for_sources`. The card text can differ between builds.
