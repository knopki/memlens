# 0009. Redaction

Status: accepted

## Context

A `redact` is final. The store writes the sanitized form, and the projection gives no content. The transaction and the derivation rules keep the text out of each derivative.

## Decisions

| ID | Date | Decision | Context | Alternatives | Consequences |
| --- | --- | --- | --- | --- | --- |
| D-030 | 2026-11-04 | A `redact` event clears the content of a record for good, and a later `amend` changes no content of the record. | A privacy erase must not lose to a later patch or to an import. | Let the newest `amend` win. Erase the content of the event only. | The erase is final. An import of a full event changes no content of a redacted record. |
| D-036 | 2026-11-04 | The model has no `scrub` step. A `redact` event writes the sanitized form into its target, and the store extends the form to each card of the target. | S-017 takes `scrub` out, and S-024 keeps it out. The card needs the same form as a note. | Keep `scrub` as a maintenance step. Keep the text of a card after a redact of a source. | One path for the sanitized form. The store rewrites the target event at the redact. A card of the source loses its text in the same step. |
| D-055 | 2026-11-04 | A `redact` runs in one transaction. It writes the sanitized form into the target, erases the nodes that cover the position and their ancestors, and erases the FTS rows. Each card with the id in `for_sources` gets the sanitized form, and its catalog nodes and ancestors go. The store needs no closure over `for_sources`, because no card retells another card. | S-054 gives the boundary. A redacted record must leave no text in the tree, in the catalog, or on the disk. The store holds no snapshot, so step 4 of S-054 has no object. | Mark the nodes dirty and rebuild them. Erase the card itself. Walk the closure over `for_sources`. | The projection gives no content at once. A rebuild gives new retellings. The transaction covers the disk. A prompt that the model already received stays out of reach. |
