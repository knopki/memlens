# 0008. Redaction

Status: accepted

## Context

A user must be able to clear content. The text can live in the log, in the tree, in the index, and in a card.

## Decision

A `redact` is final. The store writes the sanitized form into the target in one transaction. It deletes the nodes that cover the position and their ancestors, and it deletes the FTS rows. It sanitizes each card with the id in `for_sources`. The model has no `scrub` step.

- 0030: A `redact` event clears the content of a record for good, and a later `amend` changes no content of the record..
- 0036: The model has no `scrub` step.
- 0055: A `redact` runs in one transaction.

## Alternatives

A `scrub` step. Mark the nodes dirty and rebuild. Delete the card. Keep the content.

## Consequences

The projection gives no content at once. A prompt that the model already received stays out of reach. No other derivative holds the text, because the summarizer sees two children and a card sees `for_sources` only.
