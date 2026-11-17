# Architecture

Status: the storage pivot uses one SQLite row store. The core and CLI have implementations. The standalone console uses the store. The plugin implements host and preset configuration with one shared store.
The global requirements define cross-module behavior. Code contracts define implemented local behavior.

## Shape

One SQLite database holds normalized note and summary rows. Current rows are the truth. Reads and writes do not replay history. A tree of summary rows stands above notes:

- The notes of a scope make the leaves.
- Summary node rows stand above the notes, one row per aligned range.

The agent reads one map of directions: the derived scope list in the `<directions>` section.

## Parts

| Path                  | Package               | Role                                                                 |
| --------------------- | --------------------- | -------------------------------------------------------------------- |
| `packages/core`       | `@memlens/core`       | The engine: one row store, configuration, reads, tree build, and slice. |
| `packages/cli`        | `@memlens/cli`        | The terminal and HTTP host: the console command, redact, amend, import, export. |
| `packages/ui`         | `@memlens/ui`         | The browser client: seven screens with native DOM controls. |
| `packages/dsh-plugin` | `@memlens/dsh-plugin` | The harness surface: the entry points `.` and `./preset`, the tools. |

The CLI and the plugin depend on the console. The console and the CLI depend on the library. The
library depends on nothing.
Each package declares each workspace package that it imports.
The test `packages/core/tests/isolation.test.ts` holds the library rule. See [REQ-007](02-requirements.md).

## Stack

TypeScript 7 on Node.js with pnpm workspaces. biome lints and formats. vitest runs the tests. esbuild
makes the bundles. prek runs the git hooks. See [0010 Process and stack](../adr/0010-process-stack.md). The tool versions come from
`mise.toml`. See [0010 Process and stack](../adr/0010-process-stack.md).

## Build

| Package | Tool    | Output                                                            |
| ------- | ------- | ----------------------------------------------------------------- |
| core    | `tsc`   | `dist/index.js`, `dist/index.d.ts`, and the subpath `dist/view.js` |
| ui      | `tsc`   | `dist/index.js`, its types, and the standalone console in `dist/standalone/` |
| cli     | esbuild | `dist/cli.js` with a shebang, and `dist/ui/` from the console package |
| plugin  | esbuild | `lib/index.js`, one bundle                                        |
| plugin  | `tsc`   | `lib/index.d.ts` in a declaration-only run                        |

`pnpm build` runs the builds in the dependency order of the workspace. The plugin keeps the packages
external, because the harness gives them at run time. The install runs the `prepare` script of each
built package, in that same order.

## Write path

The database holds current note, node, and proposal rows. A note has a stable id, scope, slot, content, and metadata. Each operation writes its rows in one transaction.

| Op | Effect |
| -- | ------ |
| `note` | Insert one row at its `(ts, id)` rank. A duplicate of a live note writes nothing. |
| `amend` | Update the content group. A scope change moves the row at its key rank. |
| `hide` | Set the state to hidden. The content stays. |
| `redact` | Set the state to deleted, clear the content, and delete the index row. |
| `review` | Set the next review time and the last review time. |

The store validates required fields, dates, and targets before each write. A body above its limit moves the overflow into the longform.

A slot is the rank of the note in the immutable `(ts, id)` order of its scope. An insert into the middle shifts the later slots by one. An export holds no slot. A deleted note keeps its slot as a tombstone with no content. See [0020 Storage pivot](../adr/0020-storage-pivot.md).

A proposal is a local row with a payload and an expiry. Approval applies the operation and closes the row in the same transaction. No event, no replay, and no cursor exists. See [0012 Proposals](../adr/0012-proposals.md) for the workflow history.

## Projection

Reads query current rows. Store writes maintain note, node, search index, and journal rows in one transaction. The node cache is valid only when its child keys match current rows.

## Catalog

The store derives the catalog. No catalog scope, no catalog position, and no catalog node row exists. The
directions block lists the newest scopes of the profile within its budget, from the oldest to the
newest. Each line uses the current top summary of its scope. Every older scope forms one comma list
of keys with no description. A scope with no live note gives no line. See the
[context contract](../../packages/core/src/domain/context.ts) and [REQ-530](02-requirements.md).

A note change deletes each covering node row in the same transaction. Compaction rebuilds the node from its two children. The [node contract](../../packages/core/src/store/nodes.ts) and the [build contract](../../packages/core/src/store/build.ts) own the build rules.

A `redact` deletes the covering node rows of the target. No historical node row exists, so no summary holds cleared content.

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
The `language` key has one value for the store, and it selects the tokenizer of the index. See the
[schema contract](../../packages/core/src/store/schema.ts) and the
[search contract](../../packages/core/src/store/search.ts).

The `customPrompt` key replaces the whole template of the slice, and the placeholders apply in it. The
`customPromptAppend` key is the value of `{{append}}`. The
[context contract](../../packages/core/src/domain/context.ts) owns both keys.

## Defaults

| Item             | Value                                                                    | Reason                                                          |
| ---------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `body`           | 384 characters required, 512 characters accepted                          | The 512 characters give room for a miss of the model.            |
| `longform`       | 16 384 characters                                                         | The document does not enter the tree.                            |
| `memory_open`    | `head` 8 192, `all` 16 384 characters                                     | The answer continues with `offset`.                              |
| Node             | Target 512 characters, limit 640 characters, a cut with a flag            | The p90 miss is 610 characters.                                  |
| Input of a merge | Two children. At level 1, a leaf gives its body and its complete `longform` | The input holds no context, so a delete stays derivable.         |
| Budget           | The profile gives `here` and `directions` in lines                        | The user sets the size of the context.                           |
| Fold             | Stop at the first line-budget fit. The demo orders pairs by jump, due, level, and start. | The order gives one answer. |
| Compaction       | `batch` 10, a whole number above zero with no upper limit, no default model or effort, 120 calls in an hour | The user chooses the model route and optional effort. |
| Nudge            | `tool_calls` and `turns` 10                                               | The counters run at the same time.                               |
| Review           | 365 days for `decision`, `preference`, and `note`. 180 days for `fact`. 7 days for `task` | A finite default. A write can ask for `never`. |
| GC of `proposed` | 30 days                                                                   | The proposals collect without it.                                |
| `find`           | 10, and 50 for each scope                                                 | The limit gives about 50 records of 500 characters.                   |
| `cacheTtl`       | `deepseek/*` 2 hours, `anthropic/*` 5 minutes, another model 1 hour        | An idle time above the TTL gives a new snapshot.                 |

## Store

One store holds many profiles, scopes, and records. The tables, the field groups, the versions, and
the merge channels are in [04-data.md](04-data.md).

A scope is a key with the form `kind:name`. The store lowercases the key before a write. A scope exists when a note row names its key. See [0006 Scope and config](../adr/0006-scope-config.md) and the [scope grammar](../../packages/core/src/domain/scope.ts).

The store has one SQLite backend. Every write uses one transaction. The index and node cache stay in the database. The store keeps no job queue. Compaction candidates derive from dirty ranges. See [0004 Tree and writer](../adr/0004-tree-writer.md).

A change of the `language` value rebuilds the index from note rows. See the
[repair contract](../../packages/core/src/store/repair.ts).

The row store holds current notes, nodes, proposals, and metadata. It has no event log, replay cursor, or projection. Reads query rows. Writes update rows in one transaction.

The JSONL format transfers full note state. The Markdown format is export-only. The export command selects the scope. A JSONL import merges note rows by id.
See [0003 Store](../adr/0003-store.md) and [0008 Redaction](../adr/0008-redaction.md).

| Item     | Value                                       |
| -------- | ------------------------------------------- |
| Config   | `$XDG_CONFIG_HOME/memlens`                  |
| Data     | `$XDG_DATA_HOME/memlens`                    |
| Override | `MEMLENS_STORE` gives another data path     |
| Index    | FTS5 tables in `memlens.db`                 |
| Store    | `memlens.db`                                |

## View

The [context contract](../../packages/core/src/domain/context.ts) owns the render of the view.

The text is one `<memory>` section with three parts: `<how-to>`, `<directions>`, and `<here>`. The
template is in [09-prompts.md](09-prompts.md), and each placeholder takes its value.

The `<how-to>` part holds the policy text and the value of `customPromptAppend`. A `customPrompt`
value replaces the whole template, and the placeholders apply in it.

The `<directions>` part holds one direction line for each of the newest scopes of the profile, from
the oldest to the newest. A direction line has the form `[<key>] <age> <summary>`. The
[context contract](../../packages/core/src/domain/context.ts) owns the age unit. The line holds no
count and no active marker. The text is the summary of the top node of the scope. An unready top node
gives a temporary line with the key, the age, and the text assembled from the two child bodies. That
line renders at once, and the render calls no model and waits for no compaction. A scope with no live
note gives no line. Every scope older than the budget forms one comma list of keys.

The `<here>` part holds the frontier of the active scope. A leaf gives `#<pos> <YYYY-MM-DD> <body>`,
and a range gives `#<a>-<b> <start>..<end> <summary>`, or its assembled text for a temporary line.
The span names the dates only, and it writes the shared year and month once, as `2026-10-30..11-01`.

The [context contract](../../packages/core/src/domain/context.ts) owns the line budget of each part.
The `<how-to>` part is never cut.

The tree of the active scope gives the `<here>` part. The derived scope list gives the `<directions>` part.

A part above its budget merges one pair at a time, and it stops as soon as the count of lines fits the
budget. The line of the parent takes the place of the two lines of the pair. Among the pairs, a merge
minimizes the demo jump penalty before comparing due, level, and start. No pair that covers the greatest live position merges.
A scope slice therefore ends with its last live record, even when later assigned slots are empty.


A pair merges though the node of its range is not built, and a temporary line takes the place of the
two lines. So the part always reaches its budget. When no pair merges and the part is still above its
budget, the oldest lines leave the part.

The render never waits for a job. A line stays temporary until the compaction builds its node, so the
slice fits its budget at once.

An open of a note gives the note and its `longform`. An open of a node gives its non-empty children as slice lines. A range that matches no built node gives one line: the level follows
the span of the range, and the line holds the first `pos`.

A range gives a temporary line, unless its node row passes the validity keys of its halves. That line
holds the period of the range and the text assembled from its two children. The render calls no model
and stores no node. A backdated insert shifts the later slots, so a numeric address is not stable in
time.

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
The store assigns note positions by the immutable `(ts, id)` order.
A saved textual address is not a permanent record identifier.
The read models resolve record addresses and validate scope visibility.
An address with no scope waits for the tool input rules in [REQ-260](02-requirements.md) and [REQ-261](02-requirements.md).

## Tree

The [tree contract](../../packages/core/src/domain/tree.ts) owns range geometry, the fold, and the line limit.
The [tree types](../../packages/core/src/types/tree.ts) define the input and output shapes.
See [0013 The tree model](../adr/0013-tree-model.md) for the design rationale.

The store verifies aligned node starts and the summary text.
It handles empty halves and single-child copies under the [node contract](../../packages/core/src/store/nodes.ts) and the [build contract](../../packages/core/src/store/build.ts).

## Frontier

The tree has a frontier: levels of a set width, and one level covers 2^k leaves. The frontier lists
the lines from the oldest to the newest: the coarse lines first and the fresh records last. A line
holds the address, the range of dates, and the text. See [0004 Tree and writer](../adr/0004-tree-writer.md).

## Erasure

A `hide` or an `amend` deletes the covering node rows of the changed slot in the same transaction. A
review changes no node row, because it changes no summary input. A deleted node row leaves a dirty
range: the render gives the children text, and the compaction rebuilds the node. One change costs a
depth of the tree, not a count of the records.

A redact clears the note row, its index row, and the covering node rows. It deletes the proposals
that carry the target. No historical amendment and no historical node row exists, so the clearing
stays within current rows. The write runs in one transaction, and a truncating checkpoint runs after
the commit. One byte test proves the claim: after a redact, the marker text is absent from the
database file and the write-ahead log. See [REQ-527](02-requirements.md) and
[0020 Storage pivot](../adr/0020-storage-pivot.md).

A late compaction answer does not match the captured validity keys. Already delivered session
messages stay unchanged.

## Fold

The [fold and slice contracts](../../packages/core/src/domain/tree.ts) own pair selection, line budgets, temporary lines, and last-leaf preservation.
The demo supplies the comparison cases for the existing tree tests.
The context epoch is the hash of the store clock value.
See [0013 The tree model](../adr/0013-tree-model.md) for the design rationale.

## Compaction

The compaction computes candidates from dirty non-empty aligned ranges through the root.
A missing node row is a dirty candidate. A range waits for clean non-empty children before a build.
The [tree contract](../../packages/core/src/domain/tree.ts) owns the candidate order. The compaction
stores no queue, job row, or lease.
A restart derives candidates again from the tree. In-flight attempts and retry delays are local runtime state.

A run takes ready merge inputs. The key `batch` gives the count of inputs of one model call. Its
default is ten, and the value is a whole number above zero. The key sets no upper limit, and the load
rejects a value below one. The compaction section holds no key `mode`, and the load rejects a file
that holds it. The model sees the child inputs only.

A batch answer publishes each range with a good line at once. An absent line, an empty line, and a
line that is not shorter than its input leave their ranges open. The compaction retries the open
ranges in a batch of half the size, down to one input. A range that no attempt builds stays dirty,
and the worker waits ten, sixty, then three hundred seconds before its next pass.

At level 1, each leaf child gives its body and its complete `longform`. A child above level 1 gives
its summary. A join or a copy needs no model call. The build applies it only when no child carries a
`longform` and the whole content fits the node limit. A `longform` gives a model call, and one
non-empty child follows the same rule.

Each attempt copies exact child inputs as `BuildInput`. The store compares both current children under the write lock before publication.
A changed input, a hidden record, or a dirty child rejects the result. One matching key alone does not permit a result.
The compaction starts at the accepted triggers of the plugin worker, at `memlens compact`, or at a
console job. The worker makes its first pass ten seconds after activation when work waits.
The worker mirrors each pass, scope, model call, retry, and failure to the host log and console journal.
A model call states its start, finish, duration, and text size. It gives no note text.
The journal keeps the last 100 events. A failed merge answer states `no_answer`, `not_shorter`, or `invalid_batch`.
A failed model call also states the first error code and message from that pass.
Rendering returns immediately with current clean summaries and temporary lines.
See [0004 Tree and writer](../adr/0004-tree-writer.md) and [0020 Storage pivot](../adr/0020-storage-pivot.md).

## Invalidation

An import applies the five merge channels and deletes the covering node rows of each changed or
shifted slot. No historical candidate exists, so an older summary cannot return as a fallback. A
repeated import changes no row.

A local change uses the same rule: the write deletes the covering node rows of the changed slot in
the same transaction. The read compares the validity keys of each rendered node. A missed path
degrades to a dirty range, never to stale text. See the
[row validity rules](../../packages/core/src/store/view.ts) and [REQ-528](02-requirements.md).

## Session and store

A session writes the store. The export and the import move the rows between stores. An import applies
the five merge channels by `id`. Content and review merge by version, lifecycle by maximum, cleared
by latch, and the supersede link by first write. A note can supersede an earlier note. The index is a
cache over the note rows. The store rebuilds it after a loss. See
[REQ-375](02-requirements.md), [REQ-377](02-requirements.md), and [REQ-524](02-requirements.md).

## Harness surface

The [host entry](../../packages/dsh-plugin/src/index.ts) registers one shared Memlens service and validates each selected model before use.
The [preset entry](../../packages/dsh-plugin/src/preset.ts) registers settings under its DSH scope.
The [service contract](../../packages/dsh-plugin/src/service.ts) owns profile resolution and store disposal.
The [runtime contract](../../packages/dsh-plugin/src/runtime.ts) owns configuration file access and active scope inputs.
The [schema contract](../../packages/dsh-plugin/src/config.ts) owns strict field validation and DSH field metadata.
The [context contract](../../packages/dsh-plugin/src/memory-context.ts) owns the snapshot lifecycle and the restore from the session history.
The [tools contract](../../packages/dsh-plugin/src/memory-tools.ts) owns the six tools and the child modes.
The [nudge contract](../../packages/dsh-plugin/src/nudge.ts) owns the two counters and the injected line.
The [worker contract](../../packages/dsh-plugin/src/worker.ts) owns the background compaction.
See [0022 Plugin configuration](../adr/0022-plugin-configuration.md).

The plugin registers the slice as `systemPrompt.context`. It does not use a system prompt section: a
change of the section invalidates the whole cached prefix. See [0007 Slice and context](../adr/0007-slice-context.md).

The text stays the same until a trigger: a fresh session, a compaction after success, and an idle
time above the TTL. A process restart gives the same text. See [REQ-300](02-requirements.md) and
[REQ-188](02-requirements.md).

The plugin registers one context for each agent at `agent/created`. The event gives the agent scope,
and the context is bound to it: another agent does not receive the context.
The context has `required: true` and the order 220. A line for one step comes through injected context
instead, and the nudge uses that surface. The registration reads `agent.session.id`,
`agent.session.header.agentPreset`, and `agent.session.header.cwd`. The preset selects the profile, and
the cwd selects the active scope.

The harness writes the context as a user-role message after the saved history. The message survives a
restart. The harness writes a new message only when the text changes. A compaction deletes the
message, and the plugin renders a new snapshot after the compaction succeeds. See
[REQ-280](02-requirements.md) to [REQ-285](02-requirements.md).

Each runtime context has a unique name, including a plugin context. The harness combines named sections in one snapshot. The built-in
values are `WORKING_DIRECTORY` 100, `SANDBOX_POLICY` 110, `APPROVAL_POLICY` 115,
`SUBAGENT_DELEGATION` 120, `TEAM_IDENTITY` 125, `HARNESS_SOURCE` 200, and `WEB_SURFACE` 210. The
plugin uses 220, after the last built-in context. Tool declarations and prompt sections have their own
orders, so 220 places the memory after each built-in context and before no tool guide.

## Agent surface

The plugin registers these tools in the context of each agent. The mode of the profile selects the set of a subagent.

| Tool          | Who                   | Effect                                                                  |
| ------------- | --------------------- | ----------------------------------------------------------------------- |
| memory_note   | main agent, subagent  | A new note, or the live note with the same four fields.                 |
| memory_forget | main agent            | The records leave the view, and dependent summary ranges become dirty.  |
| memory_find   | main agent, subagent  | The records with the matching words, each with its `addr`.              |
| memory_open   | main agent, subagent  | A record with its `longform`, or the two children of a node.            |
| memory_review | main agent            | The due records, or the count of the reviewed records.                  |
| memory_map    | main agent, subagent  | The visible scopes, or the tree slice of one scope.                     |

A write gives the time of the note, and the default is the write time. The store ranks the note by
that time, so a note of a past moment lands before the notes of the later time. The order of the
positions therefore follows the time of the note, and not the order of the writes.

The tool behavior and the errors are in the [tool contracts](../../packages/dsh-plugin/src/tools/shared.ts) and in
[REQ-024](02-requirements.md) to [REQ-477](02-requirements.md). The subagent modes are in
[REQ-542](02-requirements.md) to [REQ-543](02-requirements.md), and the log keeps the content of a
dismissed proposal in the [config contract](../../packages/core/src/domain/config.ts). The nudge is in
[REQ-233](02-requirements.md) to [REQ-242](02-requirements.md). See
[0009 Agent surface](../adr/0009-agent-surface.md).

## Human surface

Only the CLI or the GUI can redact and amend. Review sets the next review time and stays out of the
slice. See [0020 Storage pivot](../adr/0020-storage-pivot.md) and [REQ-024](02-requirements.md).

The [console host contract](../../packages/cli/src/ui.ts) owns the command `ui`, and the [core entry
contract](../../packages/core/src/index.ts) exports the console models. The console
gives its own styles. Both hosts share one component layer, and the plugin supplies the harness
surfaces. The plugin mounts the tab `Memory` on the session page and narrows it to one profile. See
[08-ui.md](08-ui.md).

## CLI

The binary `memlens` runs without the harness, and it takes one command. The usage below gives the
commands and their flags. A flag outside the usage is an error by usage.

```text
memlens note "<body>" [--scope key] [--longform file.md] [--kind kind] [--supersedes 12,14] [--review 180d|never] [--ts iso]
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
memlens config get|set key [value]
memlens ui [--port 7788] [--allow-delete]
```

The [command contracts](../../packages/cli/src/commands.ts) own the command behavior: the target
resolution, the visible scope rules, the review periods, and the confirmation of a redact. The
[compaction job contract](../../packages/cli/src/compact.ts) owns the job of one scope and the
application of one answer file. The [entry contract](../../packages/cli/src/cli.ts) owns the dispatch
and the exit codes.
The CLI selects the first matching scope rule, then the Git repository name, then the configured default.
The command `note` uses that scope when the user omits `--scope`.

The CLI command `compact` publishes each copy input and gives the merge inputs of one scope as one
job. The flag `--answer` applies one answer file, and the store verifies each exact input again. The
command `check` tests store health, and the command `repair` rebuilds damaged cache rows. Each command contract owns its rules.

The [console host contract](../../packages/cli/src/ui.ts) owns the command `ui` and its local HTTP boundary.
The store validates proposal acceptance and applies it in one transaction.
The console gives a compaction job for one scope tree. The store derives the catalog.
The [console models](../../packages/core/src/domain/console.ts) supply the shared view through the store.
The [browser client](../../packages/ui/src/client.ts) supplies seven screens in a separate bundle.
The command `import` reads one JSONL file. The import from harness sessions is pending.

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

## Verification

| Gate              | Command              |
| ----------------- | -------------------- |
| Build             | `pnpm run build`     |
| Static types      | `pnpm run typecheck` |
| Tests             | `pnpm run test`      |
| Code and format   | `pnpm run lint`      |
| Document language | `pnpm run lint:docs` |
| All of the above  | `pnpm run verify`    |

The project keeps the linter in `scripts/vendor/`, and the manifest has a test. See
[0010 Process and stack](../adr/0010-process-stack.md).

Biome scans the code only. The documents have their own review, because the journal keeps the
customer words as given.

## Remaining work

The following items are not in the code. The other slices of this document describe the current code.

- The CLI owes the import from harness sessions. The CLI accepts no `--from` flag, and no reader of a
  session exists. See [REQ-413](02-requirements.md) and [Q-514](03-open-questions.md#q-514).
- The plugin worker calls `compactionPass` and `sweep` at the accepted triggers. The CLI starts a
  build only at `memlens compact` and at the console job.
- The standalone console gives a manual compaction job. It holds no background compaction state and
  no session snapshot state. See the [client contract](../../packages/ui/src/client.ts).
