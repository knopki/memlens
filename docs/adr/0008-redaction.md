# 0008. Redaction

Status: accepted

## Context

A user must be able to clear content. The text can live in the log, in the tree, in the index, and in the top node of a scope.

## Decision

A `redact` is final. The store writes the sanitized form into the target in one transaction. It clears the content of the nodes that cover the position and of their ancestors, and it deletes the
FTS rows. Each node above the position becomes dirty. The model has no `scrub` step.

## Alternatives

A `scrub` step. Mark the nodes dirty and rebuild. Delete the top node. Keep the content.

## Consequences

The projection gives no content at once. A prompt that the model already received stays out of reach. No other derivative holds the text, because the summarizer sees two children only.
