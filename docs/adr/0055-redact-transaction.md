# 0055. Redact transaction

Status: accepted

## Context

S-054 gives the boundary. A redacted record must leave no text in the tree, in the catalog, or on the disk. The store holds no snapshot, so step 4 of S-054 has no object.

## Decision

A `redact` runs in one transaction. It writes the sanitized form into the target, erases the nodes that cover the position and their ancestors, and erases the FTS rows. Each card with the id in `for_sources` gets the sanitized form, and its catalog nodes and ancestors go. The store needs no closure over `for_sources`, because no card retells another card.

## Alternatives

Mark the nodes dirty and rebuild them. Erase the card itself. Walk the closure over `for_sources`.

## Consequences

The projection gives no content at once. A rebuild gives new retellings. The transaction covers the disk. A prompt that the model already received stays out of reach.
