# Architecture

Status: draft. The core, CLI, and standalone console have implementations. The plugin has a scaffold.
The global requirements define cross-module behavior. Code contracts define implemented local behavior.

## Shape

The memory is a log of notes and of nodes. A tree of nodes stands above the notes. Two levels share
one engine:

- The notes of a scope make the leaves.
- The catalog of nodes is the level above the notes. It has its own tree and belongs
  to one profile.

The agent reads one map of directions: the catalog in the `<directions>` section.

## Parts

| Path                  | Package               | Role                                                                 |
| --------------------- | --------------------- | -------------------------------------------------------------------- |
| `packages/core`       | `@memlens/core`       | The engine: the configuration, store ports, the projection, the tree build, the slice. |
| `packages/cli`        | `@memlens/cli`        | The terminal and HTTP host: the console command, redact, amend, import, export. |
| `packages/ui`         | `@memlens/ui`         | The browser client: seven screens with native DOM controls. |
| `packages/dsh-plugin` | `@memlens/dsh-plugin` | The harness surface: the entry points `.` and `./preset`, the tools. |

The CLI depends on the library. The plugin depends on the library. The library depends on nothing.
The test `packages/core/tests/isolation.test.ts` holds this rule. See [REQ-007](02-requirements.md).

## Stack

TypeScript 7 on Node.js with pnpm workspaces. biome lints and formats. vitest runs the tests. esbuild
makes the bundles. prek runs the git hooks. See [0010 Process and stack](../adr/0010-process-stack.md). The tool versions come from
`mise.toml`. See [0010 Process and stack](../adr/0010-process-stack.md).

## Build

| Package | Tool    | Output                                     |
| ------- | ------- | ------------------------------------------ |
| core    | `tsc`   | `dist/index.js` and `dist/index.d.ts`      |
| cli     | esbuild | `dist/cli.js`, one bundle with a shebang   |
| ui      | CLI esbuild | `packages/cli/dist/ui/client.js`, with HTML and CSS assets |
| plugin  | esbuild | `lib/index.js`, one bundle                 |
| plugin  | `tsc`   | `lib/index.d.ts` in a declaration-only run |

`pnpm build` runs the builds in the dependency order of the workspace. The plugin keeps the packages
external, because the harness gives them at run time.

## Event log

The log holds events. An event has `id` (ULID), `at`, `op`, and `scope`. The payload belongs to the
op. A `redact` clears the content of its target.

| Op        | Payload                                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `note`    | `body`, `kind`, `ts`, `review_at`, `proposed`, `session`, `turn`, `preset`, and the optional `longform`, `refs`, `supersedes` |
| `amend`   | `target`, and one or more of `body`, `longform`, `scope`, `kind`, and `supersedes`                                                                         |
| `hide`    | `target`, `reason`                                                                                                                                        |
| `redact`  | `target`, `reason`                                                                                                                                        |
| `review`  | `target`, `review_at`                                                                                                                                     |
| `dismiss` | `target`, `reason`                                                                                                                                        |
| `node`    | `level`, `start`, `child_a`, `child_b`, `input_rev`, `summary`, `chars`, `truncated`, `ts_from`, `ts_to`                                                  |
| `invalidate` | `targets`, the ids of node events whose summaries must stay unusable |

The proposed modifier marks an ordinary write operation, and the projection ignores that operation.
Approval applies the ordinary operation and closes the selected proposal with a dismiss event.
No separate acceptance field or event form is necessary. See [0012 Proposals](../adr/0012-proposals.md).

A node is a `node` event. Its `at` is the time of the build.
The projection takes the latest candidate whose id has no invalidation.
An `invalidate` event changes no note and deletes no text. See [0015 Node invalidation](../adr/0015-node-invalidation.md).

An event has two times: `at` is the time of the log, and `ts` is the time of the write of a note. Only
the `note` event carries `session`, `turn`, and `preset`.
The [validation contract](../../packages/core/src/domain/validation.ts) owns required fields, permitted payloads, dates, and target types.

A position is not an event field. It derives from real record entries into a scope in canonical event order,
and an export holds no `pos`. A sanitized event keeps its operation and structural metadata, with `redacted: true`.
A note has empty body and null longform. An amendment clears present content fields and retains absent fields.
A node has empty summary and zero chars. See [0002 Event log](../adr/0002-event-log.md), [0008 Redaction](../adr/0008-redaction.md), and
[Q-030](03-open-questions.md#q-030).

## Projection

The [projection contract](../../packages/core/src/domain/projection.ts) owns canonical replay, record states, supersede effects, and scope positions.
Its entity contracts define both passes and each operation. The [tree contract](../../packages/core/src/domain/tree.ts) owns range revisions and summary readiness.

The store supplies the resolved event union and durable invalidations before replay.
Node publication remains a store and writer guarantee under [REQ-113](02-requirements.md).

The [validation contract](../../packages/core/src/domain/validation.ts) checks runtime fields and target types.
The [merge contract](../../packages/core/src/domain/merge.ts) resolves copies and applies all historical erasure evidence.
It also returns invalidation evidence from losing copies. The write plan persists targets absent from the winning history.
The [invalidation contract](../../packages/core/src/domain/invalidation.ts) compares exact inputs and both old and new paths.
The [write contract](../../packages/core/src/domain/write.ts) composes these functions before backend publication.
Its projection includes planned invalidations. The backend must publish their events with the data under one write lock.
These pure plans implement no storage durability. The backends publish their complete plans under one write lock.
See [0016 Write boundary](../adr/0016-write-boundary.md) and [0017 Store publication](../adr/0017-store-publication.md).

## Catalog

The catalog has one scope for each profile: `__catalog__:<profile>`. The key is hidden from the
agent. The catalog is a tree over the scopes of the profile. One position holds one scope, and the
content of the position is the top node of the tree of that scope. A node above the leaves lives in
the catalog scope. A node of the catalog carries no `review_at`, no `proposed`, no `session`, no
`turn`, and no `preset`. See [0011 Nodes are events](../adr/0011-nodes-are-events.md) and
[S-104](../statements.md#s-104).

The [catalogTree contract](../../packages/core/src/domain/projection.ts) owns catalog positions for a resolved profile filter.
The store derives that filter from configuration before it supplies the projection to the catalog.

An import merges the events and derives the positions again. It does not merge independent counter values.
The same log and profile filter give the same positions after a restart or either import order.
A changed leaf identity or position invalidates its old and new catalog paths. The unaffected prefix and scope tree coordinates stay intact.
At a catalog leaf, child lookup uses that position to find the scope and its current top node.
The node is the existing scope root, with no synthetic event. Its range belongs to the scope tree, not to the catalog position.
A live scope with an unready root is non-empty, so the catalog writer waits for it.
See the [catalog contracts](../../packages/core/src/domain/projection.ts) and [0011 Nodes are events](../adr/0011-nodes-are-events.md).

The catalog renders in `<directions>`, and the direction line of a scope is the line of its top node.
When the top node is not ready, its direction line gives the keys and the age, and no summary text. A scope with no
live note gives no direction line. A shared scope gets one position in each profile where it is
visible. See [REQ-108](02-requirements.md), the [context contract](../../packages/core/src/domain/context.ts),
the [catalog contract](../../packages/core/src/domain/projection.ts), and the [root contract](../../packages/core/src/domain/tree.ts).

A change of a note makes each node above it dirty, and the writer builds the node from its two
children. A rebuild appends a new `node` event for the same key.
The projection takes the latest candidate whose id has no invalidation.
The [invalidation contract](../../packages/core/src/domain/invalidation.ts) owns affected scope and catalog paths.
[REQ-113](02-requirements.md), [REQ-117](02-requirements.md), and [REQ-192](02-requirements.md) retain writer publication and build guarantees.

A `redact` clears historical dependent nodes through their child ids, including earlier scope paths and catalog ancestors.
The placeholder `[redacted]` appears in the console and the view only, and no event holds it.

## Configuration

The [config contract](../../packages/core/src/domain/config.ts) owns the TOML source and the merge of
the base file, the profile patch, and the preset. The table below gives the source of each layer.

| Layer  | Source                                    |
| ------ | ----------------------------------------- |
| Base   | `$XDG_CONFIG_HOME/memlens/config.toml`     |
| Patch  | the row `memlens` of `cordis.patch.yml`    |
| Preset | the agent preset                           |

[config.d.ts](config.d.ts) gives the type of each layer, and the type holds the keys of that layer.
The [config contract](../../packages/core/src/domain/config.ts) owns the strict load, the XDG
directories, the store path order, and the cache TTL lookup.
The [active scope contract](../../packages/core/src/domain/active-scope.ts) owns the ordered rules
and the visible scope list of a profile.
A key outside the type is an error at load. A scope key outside the shape `segment:segment` is an
error at load.

The result of the merge is the type `ResolvedConfig`.

The store path comes from `--store` first, then the patch, then `MEMLENS_STORE`, then the base file.
The CLI has no patch, so its order is `--store`, `MEMLENS_STORE`, the base file.

The `budget` keys `here` and `directions` count lines. The [context contract](../../packages/core/src/domain/context.ts) owns the independence of the two budgets.
The `language` key has one value for the store, and it selects the tokenizer of the index. See
[REQ-291](02-requirements.md) and [REQ-450](02-requirements.md).

The `customPrompt` key replaces the whole template of the slice, and the placeholders apply in it. The
`customPromptAppend` key is the value of `{{append}}`. See [REQ-453](02-requirements.md) and
[REQ-454](02-requirements.md).

## Defaults

| Item             | Value                                                                    | Reason                                                          |
| ---------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `body`           | 384 characters required, 512 characters accepted                          | The 512 characters give room for a miss of the model.            |
| `longform`       | 16 384 characters                                                         | The document does not enter the tree.                            |
| `memory_open`    | `head` 8 192, `all` 16 384 characters                                     | The answer continues with `offset`.                              |
| Node             | Target 512 characters, limit 640 characters, a cut with a flag            | The p90 miss is 610 characters.                                  |
| Input of a merge | Two children, and 1 024 characters of `longform` at level 1               | The input holds no context, so a delete stays derivable.         |
| Budget           | The profile gives `here` and `directions` in lines                        | The user sets the size of the context.                           |
| Fold             | Stop at the first line-budget fit. The demo orders pairs by jump, due, level, and start. | The order gives one answer. |
| Writer           | `parallel` 6, `batch` 6, effort `off`, 120 calls in an hour               | Thinking gives 8.8 k output tokens for a retelling.              |
| Nudge            | `tool_calls` and `turns` 10                                               | The counters run at the same time.                               |
| Review           | 365 days for `decision`, `preference`, and `note`. 180 days for `fact`. 7 days for `task` | A finite default. A write can ask for `never`. |
| GC of `proposed` | 30 days                                                                   | The proposals collect without it.                                |
| `find`           | 10, and 50 for each scope                                                 | The limit gives about 50 records of 500 characters.                   |
| `cacheTtl`       | `deepseek/*` 2 hours, `anthropic/*` 5 minutes, another model 1 hour        | An idle time above the TTL gives a new snapshot.                 |
| Context          | 65 536 tokens at least                                                    | The slice and the reserve fit.                                   |

## Store

One store holds many profiles, scopes, and records.

A scope is a key in the events. The key has the form `kind:name`, and the store lowercases it before
the write. The store holds no record for a scope, and no event describes one. A scope exists because
a record names its key. See [0006 Scope and config](../adr/0006-scope-config.md) and the [scope grammar](../../packages/core/src/domain/scope.ts).

The store has two backends of equal rank: sqlite and jsonl. One store test runs against both.
Writer candidates derive from dirty ranges, including ranges with no node event. The store keeps no job queue. See
[0004 Tree and writer](../adr/0004-tree-writer.md).

Each append to the sqlite backend is one transaction, and the backend uses write-ahead logging. The
jsonl backend takes a lock on each append. Several processes write one store. See
the [SQLite contract](../../packages/core/src/storage/sqlite.ts), the [JSONL contract](../../packages/core/src/storage/jsonl.ts), and [REQ-375](02-requirements.md).

The index records the tokenizer of its build. A change of the `language` value rebuilds the index
from the log, so the store needs no migration. See [REQ-476](02-requirements.md).

The store keeps a projection: the records, the current node of each range, the invalidated ids, and the scope counts.
Its replay cursor marks a local append position. SQLite uses its append sequence, and JSONL uses a byte offset after a complete line.
The SQLite append transaction changes the projection and cursor together. JSONL replaces the complete source before its sidecar transaction.
Both backends persist invalidations with the source change. The sidecar fingerprint prevents reads from a stale projection.

The pending incremental recovery reads complete lines after the JSONL cursor, regardless of event time. It applies events in `(at, id)` order.
The current JSONL backend rebuilds after each source change. See [0017 Store publication](../adr/0017-store-publication.md).
An earlier imported event, a changed event payload, or a gap above 1 000 events requires a projection rebuild.
A JSONL rewrite or replacement invalidates its earlier cursor. The next read rebuilds the projection before it advances the cursor.

A projection rebuild reads each event once, preserves node events and invalidations, and calls no model.
A schema change still uses a migration in one transaction. The render scans no event.
See [0014 Store projection](../adr/0014-store-projection.md) and [REQ-484](02-requirements.md) to [REQ-494](02-requirements.md).

The Markdown format is export-only. It is a human view and has no import or event recovery contract.
The JSONL format transfers events. Store import reads JSONL, while the separate session import reads harness sessions.
The [export format contract](../../packages/cli/src/export-md.ts) owns the filename encoding and the file format.

An export reads one transaction under an exclusive lock, so the copy is consistent by construction.
The [export command contract](../../packages/cli/src/commands.ts) owns the scope selection of an
export. A per-scope export also holds the top node of that scope. An import unions events by `id`.
A sanitized copy takes priority. Equal sanitized status compares `at`, then the canonical JSON hash.
The import collects erasure evidence from both sides and clears the merged dependencies before publication.
See [0003 Store](../adr/0003-store.md) and [0008 Redaction](../adr/0008-redaction.md).

| Item     | Value                                       |
| -------- | ------------------------------------------- |
| Config   | `$XDG_CONFIG_HOME/memlens`                  |
| Data     | `$XDG_DATA_HOME/memlens`                    |
| Override | `MEMLENS_STORE` gives another data path     |
| Index    | A separate port over FTS5                   |
| JSONL    | The sidecar file `index.db` holds the index and the projection |
| Projection | The records, the current node of each range, and the scope counts |
| SQLite file | `memlens.db` |
| JSONL file | `memlens.jsonl` |
| Sidecar | `index.db` holds the index and the projection of the jsonl backend |

## View

The [context contract](../../packages/core/src/domain/context.ts) owns the render of the view.

The text is one `<memory>` section with three parts: `<how-to>`, `<directions>`, and `<here>`. The
template is in [09-prompts.md](09-prompts.md), and each placeholder takes its value.

The `<how-to>` part holds the policy text and the value of `customPromptAppend`. A `customPrompt`
value replaces the whole template, and the placeholders apply in it.

The `<directions>` part holds one direction line for each range of the scopes. A direction line has
the form `[<keys>] <age> <summary>`. A line above one scope joins its keys with a comma and gives the
range of their idle times, as `10..20d`. One scope gives its idle time in minutes, hours, or days. The
line holds no count and no active marker. The text is the summary of the top node of the range. An
unready top node gives no text, and the line names no period.
A scope with no live records gives no line. The catalog follows the same minimal fold and line budget.

The `<here>` part holds the frontier of the active scope. A leaf gives `#<pos> <YYYY-MM-DD> <body>`,
and a range gives `#<a>-<b> <ts_from>..<ts_to> <summary>`, or the two dates only for a temporary line.

The [context contract](../../packages/core/src/domain/context.ts) owns the line budget of each part.
The `<how-to>` part is never cut.

Each part is a tree. The tree of the active scope gives the `<here>` part, and the catalog tree gives
the `<directions>` part.

A part above its budget merges one pair at a time, and it stops as soon as the count of lines fits the
budget. The line of the parent takes the place of the two lines of the pair. Among the pairs, a merge
minimizes the demo jump penalty before comparing due, level, and start. No pair that covers the greatest live position merges.
A scope slice therefore ends with its last live record, even when later assigned positions are empty.
The catalog keeps its greatest non-empty scope leaf unfolded by the same rule.

A pair merges though the node of its range is not built, and a temporary line takes the place of the
two lines. So the part always reaches its budget. When no pair merges and the part is still above its
budget, the oldest lines leave the part.

The render never waits for a job. A line stays temporary until the writer builds its node, so the
slice fits its budget at once.

An open of a note gives the note and its `longform`. An open of a node gives its non-empty children as slice lines. A range that matches no built node gives one line: the level follows
the span of the range, and the line holds the first `pos`.

A range gives a temporary line, unless its node passes both tests: `built` and `clean`. That line
holds the period of the range and no text, and the render calls no model. A rebuild keeps each address, because a merge with
another log is the only change of the order.

A `redact` cleans the store. The copy in the session history stays. See
[0007 Slice and context](../adr/0007-slice-context.md).

## Nudge

The plugin gives the nudge as injected context for the next step, with its own source kind,
`memlens-nudge`. The harness claims the context at the next step boundary. The line is not part of the
slice and not part of the memory context.

The `[nudge]` section gives the counters `tool_calls` and `turns`. The two counters run at the same
time. Each counter counts from the session start, from the last nudge, or from the last write of a
note. A counter that reaches its value gives its line for that turn, and the context holds no text in
another turn.

The text of each counter holds `{n}`, and the count of that counter takes the place of `{n}`. The
texts are in [09-prompts.md](09-prompts.md).

## Addressing

The [address contract](../../packages/core/src/domain/address.ts) owns parsing and address text.
The [projection contract](../../packages/core/src/domain/projection.ts) owns scope transfers and position allocation.
A saved textual address is not a permanent record identifier.
Tool scope resolution remains in [REQ-260](02-requirements.md), [REQ-261](02-requirements.md), and [REQ-276](02-requirements.md).

## Tree

The [tree contracts](../../packages/core/src/domain/tree.ts) own range geometry, root selection, child readiness, revisions, and live dates.
The [tree types](../../packages/core/src/types/tree.ts) define the input and output shapes.
See [0013 The tree model](../adr/0013-tree-model.md) for the design rationale.

The [node validation contract](../../packages/core/src/domain/validation.ts) owns aligned starts and summary metadata checks.
It handles empty halves and single-child copies under the [build input contract](../../packages/core/src/domain/tree.ts) and the [writer contract](../../packages/core/src/domain/writer.ts).

## Frontier

The tree has a frontier: levels of fixed width, and one level covers 2^k leaves. The frontier lists
the lines from the oldest to the newest: the coarse lines first and the fresh records last. A line
holds the address, the range of dates, and the text. See [0004 Tree and writer](../adr/0004-tree-writer.md).

## Erasure

A `hide` or an `amend` makes the ancestors of the position dirty. A dirty node does not
render, and its children take its place down to a clean node or a record. The rebuild goes bottom-up,
and one change costs `log2(N)+1` model calls at most. See the [slice contract](../../packages/core/src/domain/tree.ts) and [REQ-218](02-requirements.md).

A redaction clears the note, every historical amendment, and every historical node whose child dependencies reach cleared event ids.
The clearing follows source ids across scopes and catalogs. Current numeric positions do not determine historical dependencies.
A cleared parent summary does not clear its unaffected child notes or sibling subtree.
The store invalidates affected node ids and excludes sanitized nodes from current candidates.

Sanitized notes and amendments set their record to `deleted` and `content_cleared`, including imports without the original redact event.
The store clears the index, projection content, and future view caches. A late writer answer fails the exact-input check.
Already delivered session messages stay unchanged.

Publication uses one exclusive store lock and an atomic source replacement. SQLite journals and the disposable JSONL index cannot accompany the sanitized source with stale content.
A successful operation leaves no cleared content in store-owned named files or journals.
A crash leaves either the earlier complete source or the complete sanitized source. Recovery runs before a read.
See the [sanitization contracts](../../packages/core/src/domain/sanitization.ts) for content closure and [0008 Redaction](../adr/0008-redaction.md) for backend publication.
[REQ-219](02-requirements.md) and [REQ-222](02-requirements.md) define atomic publication and cache clearing.

## Fold

The [fold and slice contracts](../../packages/core/src/domain/tree.ts) own pair selection, line budgets, temporary lines, and last-leaf preservation.
The demo supplies the comparison cases for the existing tree tests.
The cache key remains `epoch = hash(storeRev, sorted built nodes)` under [REQ-173](02-requirements.md).
See [0013 The tree model](../adr/0013-tree-model.md) for the design rationale.

## Writer

The background writer computes candidates from dirty non-empty aligned ranges through the root.
A missing node event is a dirty candidate. A range waits for clean non-empty children before a build.
The [tree contract](../../packages/core/src/domain/tree.ts) owns the candidate order. The writer
stores no queue, job row, or lease.
A restart derives candidates again from the tree. In-flight attempts and retry delays are local runtime state.

A run uses `parallel`, `batch`, or `auto`. Parallel makes six concurrent calls, one line per call.
Batch makes one call for up to six lines. A broken batch answer retries once, then uses parallel.
Auto follows the model family. The existing retry waits are ten, sixty, then three hundred seconds.
The model sees the two child inputs only. One non-empty child copies its text without a model call.

Each attempt copies exact child inputs as `BuildInput`. The store compares both current children under the write lock before publication.
A changed input, a hidden record, or a dirty child rejects the result. The revision equality alone does not permit a result.
The writer starts when dirty candidates reach `writer.batch`, after `store.idle` seconds without an event, or at `memlens compact`.
Rendering returns immediately with current clean summaries and temporary lines.
See [0004 Tree and writer](../adr/0004-tree-writer.md) and [0015 Node invalidation](../adr/0015-node-invalidation.md).

## Invalidation

An import preserves the unaffected branches of the common prefix. A changed record or position invalidates its old and new ancestor paths.
The import invalidates all historical candidates of those ranges, so an older summary cannot return as a fallback.
Each new imported node candidate also starts unusable. Reuse of new imported summaries is outside this version.
A repeated import with no new event or payload change writes no invalidation.

A local change of summary input uses the same rule. Target selection and the write share one store lock or transaction.
SQLite appends ordinary data changes and invalidations in one transaction. JSONL flushes invalidations before an ordinary append.
An import that clears stored content uses the redaction publication protocol in [0008 Redaction](../adr/0008-redaction.md).
A crash can leave an unnecessary rebuild, but it must not leave changed data with a usable stale summary.
The projection derives invalidation from the log after a restart or a rebuild. A rebuilt node has a new id.
See [0015 Node invalidation](../adr/0015-node-invalidation.md) and [REQ-510](02-requirements.md) to [REQ-513](02-requirements.md).

## Session and store

A session writes the store. The export and the import move the records between stores. An import is
a union of events by `id`. A note can supersede an earlier note. The index is a cache over the log:
the store rebuilds it from the log after a loss. See [REQ-057](02-requirements.md) to
[REQ-059](02-requirements.md) and [REQ-373](02-requirements.md) to [REQ-377](02-requirements.md).

## Harness surface

The plugin registers the slice as `systemPrompt.context`. It does not use a system prompt section: a
change of the section invalidates the whole cached prefix. See [0007 Slice and context](../adr/0007-slice-context.md).

The text stays the same until a trigger: a fresh session, a compaction after success, and an idle
time above the TTL. A process restart gives the same text. See [REQ-300](02-requirements.md) and
[REQ-188](02-requirements.md).

The plugin registers one context for each agent at `agent/created`. The event gives the agent scope,
and the context is bound to it: another agent does not receive the context.
The context has `required: true` and the order 220. A line for one step comes through injected context
instead, and the nudge uses that surface. The registration reads `agent.session.id`,
`agent.session.meta.agentPreset`, and `agent.session.meta.cwd`. The preset selects the profile, and
the cwd selects the active scope.

The harness writes the context as a user-role message after the saved history. The message survives a
restart. The harness writes a new message only when the text changes. A compaction deletes the
message, and the plugin renders a new snapshot after the compaction succeeds. See
[REQ-280](02-requirements.md) to [REQ-285](02-requirements.md).

The harness gives a name to each built-in runtime context, and no name to a plugin. The built-in
values are `WORKING_DIRECTORY` 100, `SANDBOX_POLICY` 110, `APPROVAL_POLICY` 115,
`SUBAGENT_DELEGATION` 120, `TEAM_IDENTITY` 125, `HARNESS_SOURCE` 200, and `WEB_SURFACE` 210. The
plugin uses 220, after the last built-in context. Tool declarations and prompt sections have their own
orders, so 220 places the memory after each built-in context and before no tool guide.

## Agent surface

| Tool          | Who        | Effect                                                                  |
| ------------- | ---------- | ----------------------------------------------------------------------- |
| memory_note   | main agent | A new note, or the live note with the same four fields.                 |
| memory_forget | main agent | The records leave the view, and dependent summary ranges become dirty. |
| memory_find   | main agent | The records with the matching words, each with its `addr`.              |
| memory_open   | main agent | A record with its `longform`, or the two children of a node.            |
| memory_review | main agent | The due records, or the count of the reviewed records.                  |
| memory_scopes | main agent | The visible scopes, each with its count and its last write.              |

The tool behavior and the errors are in [REQ-293](02-requirements.md) to
[REQ-352](02-requirements.md). The subagent modes are in [REQ-353](02-requirements.md) to
[REQ-363](02-requirements.md). The nudge is in [REQ-232](02-requirements.md) to
[REQ-246](02-requirements.md). See [0009 Agent surface](../adr/0009-agent-surface.md).

## Human surface

Only the CLI or the GUI can redact and amend. Review uses the `review` event and stays out of the
slice. See [0002 Event log](../adr/0002-event-log.md) and [REQ-024](02-requirements.md).

The [console host contract](../../packages/cli/src/ui.ts) owns the command `ui`, and the [core entry
contract](../../packages/core/src/index.ts) exports the console models. The console
gives its own styles, and the plugin uses the components of the harness UI. The plugin mounts the tab
`Memory` on the session page and narrows it to one profile. See [08-ui.md](08-ui.md).

## CLI

The binary `memlens` runs without the harness, and it takes one command. The usage below gives the
commands and their flags. A flag outside the usage is an error by usage.

```text
memlens note "<body>" --scope key [--longform file.md] [--kind kind] [--supersedes 12,14] [--review 180d|never]
memlens find "<words>" [--scope key]... [--since date] [--until date] [--due] [--limit 10] [--json]
memlens open <target> [--scope key] [--no-longform] [--offset N]
memlens forget <target> [--scope key] [--reason "text"]
memlens review [--scope key]... [--limit 50] [--json]
memlens review --mark <target>,<target> [--scope key] [--for 180d]
memlens redact <target> [--scope key] [--reason "text"] [--yes]
memlens amend <target> [--scope key] [--body "text"] [--longform file.md] [--kind kind] [--supersedes 12,14]
memlens scopes [--json]
memlens scope
memlens slice [--profile name] [--scope key] [--json]
memlens compact [--scope key] [--max 50] [--dry-run]
memlens compact --answer path
memlens status [--json]
memlens check [--json]
memlens repair [--dry-run]
memlens export --format md|jsonl --out dir [--scope key]
memlens import --in path [--as key] [--dry-run]
memlens import --from dsh-sessions dir [--since date] [--dry-run]
memlens config get|set key [value]
memlens ui [--port 7788] [--allow-delete]
```

The [command contracts](../../packages/cli/src/commands.ts) own the command behavior: the target
resolution, the visible scope rules, the review periods, and the confirmation of a redact. The
[compaction job contract](../../packages/cli/src/compact.ts) owns the job of one scope and the
application of one answer file. The [entry contract](../../packages/cli/src/cli.ts) owns the dispatch
and the exit codes.

The CLI command `compact` publishes each copy input and gives the merge inputs of one scope as one
job. The flag `--answer` applies one answer file, and the store checks each exact input again. The
command `check` tests the store against its log, and the command `repair` rebuilds the derived state
of the store. Each command contract owns its rules.

The [console host contract](../../packages/cli/src/ui.ts) owns the command `ui` and its local HTTP boundary.
The [decision contract](../../packages/core/src/storage/publication.ts) owns approval validation under the backend lock.
The console gives separate compaction jobs for scope trees and the profile catalog.
The [console models](../../packages/core/src/domain/console.ts) supply the shared view through the store port.
The [browser client](../../packages/ui/src/client.ts) supplies seven screens in a separate bundle.
The flag `--from` of `import` and the import from harness sessions remain pending.

The exit code marks the result: `0` a success, `1` an error of the data, `2` an error of the usage,
and `3` a refusal by a policy.

## Errors

An error carries `code` and `message`. The command maps the kind of the error to its exit code.

| Code                  | Kind            | Exit code | When                                             |
| --------------------- | --------------- | --------- | ------------------------------------------------ |
| `NotAllowed`          | policy          | 3         | A target outside the profile of `scopes`         |
| `CrossScopeSupersede` | data            | 1         | A `supersedes` of a record of another scope      |
| `Usage`               | usage           | 2         | A flag outside the usage, or no command          |
| `Data`                | data            | 1         | An unknown target, or an event that does not fit |

The [error contract](../../packages/core/src/types/errors.ts) owns code and message.
The [entry contract](../../packages/cli/src/cli.ts) owns the command exit rules.

## Code markup

Each source file has one `#region moduleContract` region at the top. The region gives the purpose, the
scope, and the invariants of the module. Each public or non-trivial entity has one region. See
[C-009](01-goals-nongoals.md).

The code writes short debug messages with key-value data. The messages act as observable contracts.

## Client and backend

A client goes in its own package and in its own bundle. A file must not mix client code and backend
code. See [C-012](01-goals-nongoals.md).

## Checks

| Check             | Command              |
| ----------------- | -------------------- |
| Build             | `pnpm run build`     |
| Type check        | `pnpm run typecheck` |
| Tests             | `pnpm run test`      |
| Code and format   | `pnpm run lint`      |
| Document language | `pnpm run lint:docs` |
| All of the above  | `pnpm run verify`    |

The project keeps the linter in `scripts/vendor/`, and the manifest has a test. See
[0010 Process and stack](../adr/0010-process-stack.md).

Biome checks the code only. The documents have their own check, because the journal keeps the
customer words as given.

## Remaining work

The CLI owes the import from harness sessions. See [REQ-413](02-requirements.md).
The plugin and its session tab remain pending. See [08-ui.md](08-ui.md) and [REQ-028](02-requirements.md).
The standalone console states no writer state and no session snapshot state. See [REQ-519](02-requirements.md).
