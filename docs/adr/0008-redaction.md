# 0008. Redaction

Status: accepted.

## Context

Content can remain in a node summary above a cleared record. A current position does not name every
derived value of an earlier import or of a scope transfer. The customer keeps the rule: clear the
body, the longform, and every engine derivative. Session history stays unchanged.

## Decision

One `redact` clears one note and keeps its row as a tombstone. The transaction clears the body, the
longform, the index row, the covering node rows, and each proposal of the target. The row keeps its
id, its slot, its date, and its state.

A cleared row refuses a content change. A later summary build uses the remaining live children, and
no path restores the cleared text. The store holds no scrub call.

The commit holds the logical delete, and the write-ahead log keeps its frames until the store
closes. The close runs one truncating checkpoint, and a busy result is a state. The command reports
no byte guarantee.

The store guarantees no cleared value in its rows and in its index. It claims no forensic clearing
of free filesystem blocks, and it rewrites no earlier export.

## Alternatives

A scrub call. Invalidation without content clearing. A byte guarantee with a temporary replacement
file and an exclusive store lock.

## Consequences

A cleared record keeps its address, so an old export cannot restore its content. A reader sees a
tombstone with no content. An already delivered session message stays as it was.
