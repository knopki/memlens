# 0007. Slice and context

Status: accepted

## Context

The agent needs one map at the start of a session. The text must stay stable for the prompt cache, and the harness gives a context slot.

## Decision

The slice is one `<memory>` block with the policy text, `<directions>`, and `<here>`. The plugin injects it through `systemPrompt.context` at `agent/created`, with `required: true` and the order 220. The plugin reads the last context message from the session history. The store holds no snapshot.

- 0015: The tree is a cache over the notes.
- 0050: The store of memlens holds no snapshot.
- 0051: The snapshot is a cache of the plugin.
- 0052: The plugin reads the text of the last snapshot from the session history and gives that text at each assembly.
- 0056: The compression works on `<directions>` first, then on `<here>`, and it cuts no policy text.
- 0057: The nudge is one line after the frozen slice, so the cached prefix stays put.
- 0058: The default text of the nudge names no unit: `[memory] {n} steps since the last record.
- 0064: The slice goes to `systemPrompt.context`, not to a system prompt section.

## Alternatives

A system prompt section. `agent.inject` with a user message. Store a snapshot in memlens. Render the text on each turn.

## Consequences

The text survives a restart. A `redact` leaves the copy in the session history. The compression keeps the policy text whole and cuts `<here>` last. The nudge follows the slice.
