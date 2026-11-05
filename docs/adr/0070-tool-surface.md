# 0070. Tool surface

Status: accepted

## Context

S-070 gives the six tools and the table of the permissions.

## Decision

The agent surface is `memory_find`, `memory_open`, `memory_note`, `memory_forget`, `memory_review`, and `memory_scope`. A write takes `reviewIn`. A note and a forget in a scope outside `scopes` give a proposal, and a review gives `NotAllowed`. `amend`, `redact`, `accept`, and `dismiss` stay in the CLI and the GUI.

## Alternatives

The surface of D-066: five tools, and no `reviewIn` on the write.

## Consequences

Q-094 and Q-096 hold the two open fields of the write and of the forget. REQ-293 to REQ-352 hold the surface and the errors.
