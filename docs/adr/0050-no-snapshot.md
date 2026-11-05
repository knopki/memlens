# 0050. No snapshot

Status: accepted

## Context

S-046 gives the render. A snapshot is a view of the store, and a second copy of it costs storage and a redact path.

## Decision

The store of memlens holds no snapshot. The plugin renders the text from the store at each trigger, and it gives the same text until the next trigger.

## Alternatives

Keep a copy of the text in the store of memlens. Render the text at each assembly.

## Consequences

One store, one truth. A `redact` cleans the store, and the next trigger renders the text again.
