# Architecture

Status: draft. The specification is the source of truth. The repository has a scaffold only.

## Shape

The memory is a log of notes and of nodes. A tree of nodes stands above the notes. Two levels share
one engine:

- The notes of a scope make the leaves.
- The catalog of nodes is the level above the notes. It has its own tree and belongs
  to one profile.

The agent reads one map of directions: the catalog in the `<directions>` block.

## Parts

| Path                  | Package               | Role                                                                 |
| --------------------- | --------------------- | -------------------------------------------------------------------- |
| `packages/core`       | `@memlens/core`       | The engine: store ports, the projection, the tree build, the slice.  |
| `packages/cli`        | `@memlens/cli`        | The terminal: the console command, redact, amend, import, export.    |
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
| `amend`   | `target`, and one or more of `body`, `longform`, and `scope`                                                                                              |
| `hide`    | `target`, `reason`                                                                                                                                        |
| `redact`  | `target`, `reason`                                                                                                                                        |
| `review`  | `target`, `review_at`                                                                                                                                     |
| `dismiss` | `target`, `reason`                                                                                                                                        |
| `node`    | `level`, `start`, `child_a`, `child_b`, `input_gen`, `summary`, `chars`, `truncated`, `ts_from`, `ts_to`                                                  |

A write op carries the optional field `proposed`, and the projection ignores a proposed event. A
decision carries the field `accepts`, the id of the proposal. See [0012 Proposals](../adr/0012-proposals.md).

A node is a `node` event. Its `at` is the time of the build, and the projection takes the latest
`node` event for a key. See [0011 Nodes are events](../adr/0011-nodes-are-events.md).

An event has two times: `at` is the time of the log, and `ts` is the time of the write of a note. Only
the `note` event carries `session`, `turn`, and `preset`. See [REQ-060](02-requirements.md) to
[REQ-085](02-requirements.md).

`pos` is not a field of an event. It is the ordinal of the creating event in the scope of the record,
and an export holds no `pos`. A redacted event keeps its `id` and gets `redacted: true`, an empty
`body` or `summary`, and a null `longform`. See [0002 Event log](../adr/0002-event-log.md), [0008 Redaction](../adr/0008-redaction.md), and
[Q-030](03-open-questions.md#q-030).

## Projection

The projection builds the records in two passes over the events ordered by `(at, id)`. Pass 1 makes
one record for each `note` event and copies its payload. The record takes `recorded_at` from `at`. A
`node` event changes no record, and a proposed event changes no record and takes no `pos`. The
current node of a key is the latest `node` event for that key.
The `gen` of a block is the `id` of the latest event that affects it. See [REQ-113](02-requirements.md)
and [REQ-462](02-requirements.md).
Pass 2 applies the operations in the same order. The order of arrival and a local `pos` change
nothing. The effects of the operations, the state order, and the supersede rule are in
[REQ-086](02-requirements.md) to [REQ-106](02-requirements.md).

## Catalog

The catalog has one scope for each profile: `__catalog__:<profile>`. The key is hidden from the
agent. The catalog is a tree over the scopes of the profile. One position holds one scope, and the
content of the position is the top node of the tree of that scope. A node above the leaves lives in
the catalog scope. A node of the catalog carries no `review_at`, no `proposed`, no `session`, no
`turn`, and no `preset`. See [0011 Nodes are events](../adr/0011-nodes-are-events.md) and
[S-104](../statements.md#s-104).

The catalog renders in `<directions>`, and the direction line of a scope is the line of its top node.
When the top node is not built, the direction line is the frontier of that scope. A scope with no
live note gives no direction line. A shared scope gets one position in each profile where it is
visible. See [REQ-108](02-requirements.md), [REQ-109](02-requirements.md),
[REQ-120](02-requirements.md), [REQ-451](02-requirements.md), and [REQ-460](02-requirements.md).

A change of a note makes each node above it dirty, and the writer builds the node from its two
children. A rebuild appends a new `node` event for the same key, and the projection takes the latest.
See [REQ-113](02-requirements.md) to [REQ-117](02-requirements.md), [REQ-191](02-requirements.md), and
[REQ-192](02-requirements.md).

A `redact` clears the content of each node that covers the position, so no node holds the text. The
placeholder `[redacted]` appears in the console and the view only, and no event holds it.

## Configuration

The configuration has three layers. The base file gives the values of the machine. The profile patch
gives the values of one harness profile. The preset gives the values of one agent.

| Layer  | Source                                    |
| ------ | ----------------------------------------- |
| Base   | `$XDG_CONFIG_HOME/memlens/config.toml`     |
| Patch  | the row `memlens` of `cordis.patch.yml`    |
| Preset | the agent preset                           |

[config.d.ts](config.d.ts) gives the type of each layer, and the type holds the keys of that layer.
A key outside the type is an error at load. A scope key outside the shape `segment:segment` is an
error at load.

The merge is deep. A later layer wins over an earlier layer. A table merges with a table. A scalar or
a list replaces the earlier value. The result is the type `ResolvedConfig`.

The store path comes from `--store` first, then the patch, then `MEMLENS_STORE`, then the base file.
The CLI has no patch, so its order is `--store`, `MEMLENS_STORE`, the base file.

The `budget` keys `here` and `directions` count lines, and the two values are independent. The
`language` key has one value for the store, and it selects the tokenizer of the index. See
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
| Fold             | `high` is the budget of the block, and `low` is its half. The order is `(due↓, level↑, start↑)` | The order gives one answer. |
| Writer           | `parallel` 6, `batch` 6, effort `off`, 120 calls in an hour               | Thinking gives 8.8 k output tokens for a retelling.              |
| Nudge            | `tool_calls` and `turns` 10                                               | The counters run at the same time.                               |
| Review           | 365 days for `decision`, `preference`, and `note`. 180 days for `fact`. 7 days for `task` | A finite default. A write can ask for `never`. |
| GC of `proposed` | 30 days                                                                   | The proposals collect without it.                                |
| `find`           | 10, and 50 for each scope                                                 | The limit gives about 50 records of 500 bytes.                   |
| `cacheTtl`       | `deepseek/*` 2 hours, `anthropic/*` 5 minutes, another model 1 hour        | An idle time above the TTL gives a new snapshot.                 |
| Context          | 65 536 tokens at least                                                    | The slice and the reserve fit.                                   |

## Store

One store holds many profiles, scopes, and records.

A scope is a key in the events. The key has the form `kind:name`, and the store lowercases it before
the write. The store holds no record for a scope, and no event describes one. A scope exists because
a record names its key. See [0006 Scope and config](../adr/0006-scope-config.md) and [REQ-255](02-requirements.md).

The store has two backends of equal rank: sqlite and jsonl. One store test runs against both. The
queue of the compaction is the set of dirty nodes, so the store keeps no queue. See
[0004 Tree and writer](../adr/0004-tree-writer.md).

Each append to the sqlite backend is one transaction, and the backend uses write-ahead logging. The
jsonl backend takes a lock on each append. Several processes write one store. See
[REQ-372](02-requirements.md) to [REQ-377](02-requirements.md).

The index records the tokenizer of its build. A change of the `language` value rebuilds the index
from the log, so the store needs no migration. See [REQ-476](02-requirements.md).

An export copies the whole store under an exclusive lock and one read transaction, so the copy is
consistent by construction. A per-scope export also holds the top node of that scope. An import unions the events by `id`, a payload conflict keeps the later
`at`, and the events of a redacted record arrive sanitized. See [0003 Store](../adr/0003-store.md).

| Item     | Value                                       |
| -------- | ------------------------------------------- |
| Config   | `$XDG_CONFIG_HOME/memlens`                  |
| Data     | `$XDG_DATA_HOME/memlens`                    |
| Override | `MEMLENS_STORE` gives another data path     |
| Index    | A separate port over FTS5                   |
| JSONL    | The sidecar file `index.db` holds the index |

## View

A view is the lines that one render gives. The render takes the records, the built nodes, and
`storeRev`, and it gives one text.

The text is one `<memory>` block with three parts: `<how-to>`, `<directions>`, and `<here>`. The
template is in [09-prompts.md](09-prompts.md), and each placeholder takes its value.

The `<how-to>` part holds the policy text and the value of `customPromptAppend`. A `customPrompt`
value replaces the whole template, and the placeholders apply in it.

The `<directions>` part holds the direction line of each scope of the profile. A direction line has
the form `[<key>] <age> <count> <text>`. The age of the active scope is `active`, and the age of
another scope is its idle time. The count is the count of live notes. The text is the summary of the
top node of the scope. When the top node is not built, the lines of the frontier of that scope take
the place of the line.

The `<here>` part holds the frontier of the active scope. A leaf gives `#<pos> <YYYY-MM-DD> <body>`,
and a block gives `#<a>-<b> <ts_from>..<ts_to> <summary>`.

The budget counts lines. The `here` value limits the `<here>` part, and the `directions` value limits
the `<directions>` part. The two values are independent, and the `<how-to>` part is never cut.

Each part is a tree. The tree of the active scope gives the `<here>` part, and the catalog tree gives
the `<directions>` part.

A part above its budget merges the built pair with the highest `due`. The line of the parent takes the
place of the two lines of the pair. The part merges pairs until it fits its budget.

A part with a node that is not built can stay above its budget, because a pair needs a built parent.
At a session start the plugin starts a build when a part is above 1.5 times its budget. The build has
a deadline of 10 seconds, and the render waits for it. The render does not wait for the queue of the
compaction.

An open of a note gives the note and its `longform`. An open of a node gives the two children of that
node, as the slice renders them. A range that matches no built node gives one block: the level follows
the span of the range, and the block holds the first `pos`. A node that is not built gives a temporary
line of its two children, so the render calls no model. A rebuild keeps each address, because a merge
with another log is the only change of the order.

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

An address is `pos`, `pos-pos`, `scope#pos`, or `scope#pos-pos`. The `pos` is the ordinal in the
scope and stays the same after an amend. The input holds no `#`, and the tool strips one leading `#`
from a copy of the slice. See [REQ-259](02-requirements.md) to [REQ-276](02-requirements.md).

## Tree

A node has the key `(level, start)`. A node of level `L` covers `2^L` consecutive `pos` values, and
`start` is a multiple of `2^L`. A `node` event holds `summary`, `ts_from`, `ts_to`, `chars`,
`input_gen`, and `truncated`, and its `at` is the time of the build. The state `built` or `dirty`
follows from `input_gen`, and the store keeps no field for it. The tree has no depth limit, and it needs no dense prefix: a
position with no live record stays empty. See [0004 Tree and writer](../adr/0004-tree-writer.md) and
[REQ-122](02-requirements.md) to [REQ-133](02-requirements.md).

## Frontier

The tree has a frontier: levels of fixed width, and one level covers 2^k leaves. The frontier lists
the lines from the oldest to the newest: the coarse lines first and the fresh records last. A line
holds the address, the range of dates, and the text. See [0004 Tree and writer](../adr/0004-tree-writer.md).

## Erasure

A `hide` or an `amend` makes the ancestors of the position dirty. A dirty node does not
render, and its children take its place down to a clean node or a record. The rebuild goes bottom-up,
and one change costs `log2(N)+1` model calls at most. See [REQ-217](02-requirements.md) and
[REQ-218](02-requirements.md).

A `redact` runs in one transaction. It writes the sanitized form into the target. It clears the
content of the nodes that cover the position and of their ancestors, and it deletes the FTS rows. See
[REQ-219](02-requirements.md) to [REQ-222](02-requirements.md).

The guarantee has four parts. The projection gives no content at once, and the rebuild gives new
retellings. The transaction covers the disk. A prompt that the model already received stays out of
reach. No other derivative holds the text, because the summarizer sees two children only. See [0008 Redaction](../adr/0008-redaction.md).

## Fold

The view is a tiling of `[0, total)` with non-overlapping blocks. The fold merges built pairs while
the view is above `high` and stops at `low = high/2`. A merge needs two neighbors of one level, a
`start` that is a multiple of `2^(level+1)`, and a built parent with a fresh input. The pair takes the
priority `due = (total - (start + 2^(level+1) - 1)) / 2^level`. The choice goes by `due`, then
`level`, then `start`. The fold calls no model for an empty child. The model works only on two
non-empty children, and the shrink check applies to that merge only. Each batch extends the prefix of
the view, so the prompt cache survives. The cache key is `epoch = hash(storeRev, sorted built nodes)`.
See [0004 Tree and writer](../adr/0004-tree-writer.md), [0003 Store](../adr/0003-store.md), and [REQ-161](02-requirements.md) to
[REQ-177](02-requirements.md).

## Writer

The writer is a background compactor. It runs outside the agent loop, from a queue of jobs in the
store. A run takes one form. `parallel` makes 6 calls of one line with one prefix of the context.
`batch` makes one call of up to 6 lines in the form `#a-b: line`, and a broken answer gives one retry
with the error, then `parallel`. `auto` follows the family of the model: `batch` without a cache, and
`parallel` with one. A merge gives the model the two children only. See [0004 Tree and writer](../adr/0004-tree-writer.md).

A job holds a lease of 120 seconds, and a failed job waits 10 seconds, then 60 seconds, then 300
seconds. A job records the `input_gen` of its children, and the store accepts the result only when
`gen` matches that record.

The render at a session start gives the view when the queue is not empty. A position with no built parent gives its
raw records. When a part of the view at a session start is above 1.5 times its budget, the store builds the
unbuilt nodes. The deadline of the build is 10 seconds, and the render gives the view at the deadline.
The writer takes the node with the highest `due` first, and a node waits for its children.

The four texts of the calls are in [09-prompts.md](09-prompts.md). See [0004 Tree and writer](../adr/0004-tree-writer.md),
[REQ-200](02-requirements.md) to [REQ-254](02-requirements.md), and
[REQ-432](02-requirements.md) to [REQ-438](02-requirements.md).

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

The plugin registers one context for each agent at `agent/created`. The event gives the agent scope.
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
| memory_forget | main agent | The records leave the view, and the queues take the rebuilds and the top nodes. |
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

The console command works alone. The UI core is in the library, and it holds no DOM, no transport, and no style. The console
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
memlens amend <target> [--scope key] [--body "text"] [--longform file.md]
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

The CLI has no active scope. The command `note` takes the scope in `--scope`. A command with a
target takes the scope in the address, as `scope#pos`, or in `--scope`. The commands `find` and
`review` take no value, and they use each visible scope.

The command `slice` is the one exception. It takes the active scope from the rules of `[scope_default]`
for the directory of the call, and `--scope` replaces the result. The profile comes from `--profile`,
or from `defaultProfile`.

The command `scope` gives the key of the active scope for the directory of the call. It gives the rule
that gave the key.

The exit code marks the result: `0` a success, `1` an error of the data, `2` an error of the usage,
and `3` a refusal by a policy.

## Code markup

Each source file has one `#region moduleContract` block at the top. The block gives the purpose, the
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

The policy text is not designed. [Q-456](03-open-questions.md) holds the question.
