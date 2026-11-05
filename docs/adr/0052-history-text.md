# 0052. History text

Status: accepted

## Context

DSH runs the provider at each assembly, and it writes the snapshot into the history only at a change. A render at each assembly makes a second snapshot.

## Decision

The plugin reads the text of the last snapshot from the session history and gives that text at each assembly. A `redact` changes no snapshot in the history.

## Alternatives

Keep the text in the memory of the plugin. Keep the text in the store of memlens.

## Consequences

One snapshot for each trigger. The copy stays in the log of the session after a `redact`.
