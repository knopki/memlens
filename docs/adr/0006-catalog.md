# 0006. Catalog

Status: accepted

## Context

The catalog is a log of cards above the notes, with one scope for each profile. A card covers one scope and one session. The model writes the card text, and a rebuild supersedes the old card.

## Decisions

| ID | Date | Decision | Context | Alternatives | Consequences |
| --- | --- | --- | --- | --- | --- |
| D-022 | 2026-11-04 | A catalog card is a `note` event with `kind: "card"`, `for_scope`, and `for_sources`. The log has no separate card op. | The two levels use one engine, so one op set serves the notes and the catalog. | A separate `card` op. A separate log for the catalog. | The card follows the note rules for hide, redact, and amend. A query for the cards filters by `kind`. |
| D-033 | 2026-11-04 | A rebuild of a card writes a new `note` event with the old card in `supersedes`. The log keeps the old card. | The card text is a retelling, and an immutable log has no rewrite of an event. | Amend the card event. Erase the card and write it again. | The old card stays in the log, and the projection hides it. The catalog tree marks the ancestors dirty. |
| D-034 | 2026-11-04 | The catalog has one scope for each profile: `__catalog__:<profile>`. A shared scope gets a card in each profile where it is visible. | A tree node must not compress a card of a personal scope with a card of a shared scope. | One catalog scope for the store. One catalog scope for each session. | The catalog of each profile stays separate. One shared scope gives several cards. |
| D-035 | 2026-11-04 | A card becomes dirty after a change of a source, and the store rebuilds it from the live records that stay. | An amend or a redact of a source changes the card text, and a rebuild of each card on each change costs tokens. | Rebuild each card at each change. Keep a stale card until the next session. | The catalog tree marks the ancestors. A rebuilt card holds only the live text. |
| D-037 | 2026-11-04 | A card carries `body`, `kind`, `ts`, `session`, `for_scope`, and `for_sources`, and no `review_at`, `proposed`, `turn`, or `preset`. | A card is a retelling of a scope, and nobody reviews it and nobody proposes it. | Give a card each field of a note. Give a card a review date. | The card payload stays small. The store refuses a card with a review field or a proposal field. |
| D-053 | 2026-11-04 | The body of the card is the answer of the model, and the limit is 512 bytes. The direction line adds the `[<key>] ` prefix. The fallback is the three last bodies of the input, joined by `; `, and a cut to 512 bytes. A session end and a compaction build the card of each scope with records of the session. | S-023 gave the join of the bodies. The card must fit one line of the directions block, and a model line is shorter than the bodies. | The join of the bodies at each build. The model only above the limit. See Q-058. | The card text is not a function of the store alone, and a rebuild is not reproducible. The fallback gives the same text at each build. Each build costs at least one model call. Each build costs at least one model call. |
