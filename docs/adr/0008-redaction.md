# 0008. Redaction

Status: accepted. [0020 Storage pivot](0020-storage-pivot.md) replaces the event mechanism.

## Context

Content can remain in historical amendments, node events, catalog ancestors, the projection, and the index.
A current position does not identify every earlier dependency after an import or a scope transfer.
The customer keeps the existing rule: clear body, longform, and all engine derivatives. Session history stays unchanged.

## Decision

### Event structure

A `redact` is final. A sanitized event keeps its operation, id, time, scope, and all other structural fields.
A note has `body: ""` and `longform: null`. An amendment clears present content fields and keeps absent content fields absent.
A node has `summary: ""` and `chars: 0`. Sanitization adds `redacted: true`.
The event keeps targets, child ids, source fields, dates, and proposal fields.
`events.d.ts` defines these three forms. Other operations keep their existing shape.

### Historical content

The store collects the target note ids before it changes content.
Redact targets, sanitized note ids, and targets of sanitized amendments identify cleared records.
The projection sets those records to `deleted` and `content_cleared`, even without the original redact event.
Sanitized node ids identify cleared summaries only.
The store clears the original notes and every amendment of those notes, including historical and proposed amendments.
A later amendment can change scope but cannot restore content. Historical scope metadata stays in the log.

The store follows `child_a` and `child_b` through every historical node event.
A node whose input refers to a cleared event also loses its summary. Its id then clears the summaries of its ancestors.
This process includes old scope paths and catalog paths. It uses event ids, not current numeric ranges.
A sanitized node clears no child note. A mixed summary can disappear while its unaffected source notes remain.
The store also invalidates the affected node ids. A sanitized node never becomes a current candidate, even without an invalidation event.

The store clears derived projection content, FTS rows, and view caches before it completes the operation.
The store has no `scrub` call. A later summary rebuild uses the remaining live inputs.

### Import and writer

The import collects erasure evidence from local and incoming copies before it resolves conflicts.
A sanitized copy wins over an unsanitized copy of the same event id, before the normal payload comparison.
Copies with the same sanitized status compare `at`, then the canonical JSON hash.
The import applies the full clearing rule to the merged events before it publishes content.
It checks local and incoming historical nodes. An old export cannot restore a cleared note, amendment, or summary.
Sanitized forms supply erasure evidence even when the import omits the original redact event.

A missing referenced note or node, a cycle, or a node with no source input makes a summary chain unresolved.
Malformed event fields still fail normal validation.
If erasure evidence exists, an unresolved summary chain cannot retain summary text.
The store clears that summary conservatively and keeps its structural fields. This rule does not clear unrelated source notes.
A later import can complete the chain but cannot restore a summary that already has `redacted: true`.

The writer checks its exact inputs under the write lock before it appends a result.
A redaction during a model call makes that result stale. The store rejects it and saves no copy in a cache.
See [0015 Node invalidation](0015-node-invalidation.md).

### Publication

A redaction publishes one logical state change under the exclusive store lock.
A reader sees either the earlier state or the complete sanitized state. It never sees a partial clearing.
The backend prepares sanitized source data and clears derived files before it publishes that state.
The successful command leaves no cleared content in store files, active journals, sidecars, or store temporary files.
A recovery completes required cleanup before it permits a read. A source rewrite invalidates the earlier replay cursor.
The backend publication steps must preserve this rule after a crash. An import that clears stored content uses the same protocol.

The backend prepares a clean replacement source on the same filesystem. It writes sanitized events directly, with no temporary plaintext copy.
For SQLite, the replacement also holds the projection and index. The backend checkpoints and closes the earlier source and clears its journals before publication.
For JSONL, the backend closes and deletes the disposable index and its journals before publication.
The earlier log still permits a cache rebuild until the source swap.

The store lock remains independent of the source file that the backend replaces.
Source connections stay within their operation lock and close before redaction takes the exclusive lock.
No reader, writer, export, or cache rebuild can access the source during that replacement.
The backend flushes the replacement, publishes it atomically, and flushes the directory metadata before success.
Later operations open the published source, so no writer appends through an earlier source handle.

A crash before publication leaves the earlier source complete. A crash after publication leaves the sanitized source without a stale index or journal.
Recovery discards unpublished temporary files and rebuilds missing derived data. It calls no model.
The file guarantee covers store-owned named files. It does not claim forensic clearing of filesystem blocks or rewrite earlier external exports.

## Alternatives

A `scrub` call. Invalidation without content clearing. Clearing only the current node or the current numeric path.
These options leave historical content in the store.

## Consequences

Structural metadata permits projection recovery and later dependency checks. Cleared content cannot return through old events or writer answers.
Already delivered session messages stay unchanged. The store does not rewrite prompts that a model already received.
The backend verification must include historical paths, incomplete inputs, stale writer answers, and crashes before and after publication.
