# 0051. Context copy

Status: accepted

## Context

S-044 asks why the slice belongs to the plugin. The store of memlens renders it, and DSH holds it in the session.

## Decision

The snapshot is a cache of the plugin. The harness receives the text through `systemPrompt.context`, and the session history keeps the copy.

## Alternatives

Keep the text in the store of memlens. Ask the harness for the text on each build.

## Consequences

The harness holds the copy in the session. The store of memlens stays the source of the slice.
