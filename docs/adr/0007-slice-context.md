# 0007. Slice and context

Status: accepted. [0025 Context refresh](0025-context-refresh.md) replaces the refresh triggers.

## Context

The agent needs one map at the start of a session. The harness gives a context slot.

## Decision

The slice is one `<memory>` block with the policy text, `<directions>`, and `<here>`. The plugin injects it through `systemPrompt.context` at `agent/created`, with `required: true` and the order 220. The plugin reads the last context message from the session history. The store holds no snapshot.

## Alternatives

A system prompt section. `agent.inject` with a user message. Store a snapshot in memlens.

## Consequences

The text survives a restart. A `redact` leaves the copy in the session history. A part above
its budget merges pairs, and one line then covers the raw lines that stay. The nudge is one line of
the turn, and it is not part of the memory text.
