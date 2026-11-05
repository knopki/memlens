# Architecture

Status: draft. The specification is the source of truth. The repository has a scaffold only.

## Shape

The memory is a log of curated notes. A tree of retellings is a cache above the log. Two levels share
one engine:

- The notes of a scope make the leaves.
- The catalog of cards is the level above the notes. It has its own tree and belongs
  to one profile.

The agent reads one map of directions: the registry and the catalog in one `<directions>` block.

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
| `note`    | `body`, `kind`, `ts`, `review_at`, `proposed`, `session`, `turn`, `preset`, and the optional `longform`, `refs`, `supersedes`, `for_scope`, `for_sources` |
| `amend`   | `target`, and one or more of `body`, `longform`, and `scope`                                                                                              |
| `hide`    | `target`, `reason`                                                                                                                                        |
| `redact`  | `target`, `reason`                                                                                                                                        |
| `review`  | `target`, `review_at`                                                                                                                                     |
| `accept`  | `target`                                                                                                                                                  |
| `dismiss` | `target`, `reason`                                                                                                                                        |

A card is a `note` event with `kind: "card"`, `for_scope`, and `for_sources`. The log has no card op.

An event has two times: `at` is the time of the log, and `ts` is the time of the write of a note. Only
the `note` event carries `session`, `turn`, and `preset`. See [REQ-060](02-requirements.md) to
[REQ-085](02-requirements.md).

`pos` is not a field of an event. It is the ordinal of the creating event in the scope of the record,
and an export holds no `pos`. A redacted event keeps its `id` and gets `redacted: true`, an empty
`body`, and a null `longform`. See [0002 Event log](../adr/0002-event-log.md), [0008 Redaction](../adr/0008-redaction.md), and
[Q-030](03-open-questions.md#q-030).

## Projection

The projection builds the records in two passes over the events ordered by `(at, id)`. Pass 1 makes
one record for each `note` event and copies its payload. The record takes `recorded_at` from `at`.
Pass 2 applies the operations in the same order. The order of arrival and a local `pos` change
nothing. The effects of the operations, the state order, and the supersede rule are in
[REQ-086](02-requirements.md) to [REQ-106](02-requirements.md).

## Catalog

The catalog has one scope for each profile: `__catalog__:<profile>`. The key is hidden from the
agent. A card is a `note` event in this scope with `kind: "card"`, `for_scope`, and `for_sources`. A
card carries `body`, `kind`, `ts`, `session`, `for_scope`, and `for_sources`. It carries no
`review_at`, `proposed`, `turn`, or `preset`. See [0005 Catalog](../adr/0005-catalog.md) and
[0005 Catalog](../adr/0005-catalog.md).

The catalog renders in `<directions>`, and the direction line of a scope is its live card. A session
end and a compaction build the card of each scope with records of the session. The model writes the
body from the live records. Without a model answer, the store joins the three last bodies, ordered by
`ts`, with `; `.

A rebuild writes a new card with the old card in `supersedes`, and the catalog tree marks the
ancestors of the old card dirty. A change of a source marks each card of that source dirty. See
[0005 Catalog](../adr/0005-catalog.md), [0005 Catalog](../adr/0005-catalog.md), [REQ-108](02-requirements.md) to
[REQ-120](02-requirements.md), and [REQ-190](02-requirements.md) to [REQ-199](02-requirements.md).

A card with a redacted id in `for_sources` gets the sanitized form: an empty `body`, a null
`longform`, and `redacted: true`. The placeholder `[redacted]` appears in the console and the view
only, and no event holds it.

## Configuration

The CLI reads a TOML file. The harness reads the plugin config in `cordis.patch.yml` and the agent
preset. The plugin merges three layers: the TOML file, the profile patch, and the preset patch. The
patch wins over the TOML, and the preset wins over the profile. An array replaces an array. See
[0006 Scope and config](../adr/0006-scope-config.md).

| Layer        | File                       | Keys                                                                 |
| ------------ | -------------------------- | -------------------------------------------------------------------- |
| CLI and base | `$XDG_CONFIG_HOME/memlens` | `store`, `profile.<name>`, `scope_default`, `nudge`, `writer`, `review` |
| Profile      | `cordis.patch.yml`         | `store`, `defaultProfile`, `writer`, `nudge`, `language`, `cacheTtl`, `customPrompt`, `customPromptAppend` |
| Preset       | the agent preset           | `profile`, `writer`, `budget`                                        |

The `store` key of the patch sets the same store as the TOML `store` section and `MEMLENS_STORE`. The
plugin takes the patch first, then `MEMLENS_STORE`, then the TOML file. The CLI takes `--store` first,
then `MEMLENS_STORE`, then the TOML file.

The `writer` section gives `provider`, `model`, `effort`, `mode`, `batch`, and `maxCallsPerHour`. The
`mode` is `parallel`, `batch`, or `auto`, and the default is `auto`. The `cacheTtl` map gives a
duration for a model glob, and the most specific glob wins. The `language` key gives the language that
the prompt recommends for the notes, and the default is `en`. See [S-067](../statements.md#s-067) and
[S-068](../statements.md#s-068).

The `customPrompt` key replaces the policy text in the slice, and the `customPromptAppend` key adds
text after it. See [S-094](../statements.md#s-094).

The `nudge` section gives `mode` and `tool_calls` in the patch. The TOML file gives the other nudge
keys. The `[scope_default]` section gives the scope rules and the fallback key. The rules go in order,
and the first match gives the active scope. See [REQ-262](02-requirements.md),
[REQ-263](02-requirements.md), [REQ-272](02-requirements.md), and [0006 Scope and config](../adr/0006-scope-config.md).

A profile lists its scopes as keys, and `*` matches any text of the kind or of the name. The budget
gives `here` and `directions` in bytes, and the two budgets are independent. The subagent mode is
`propose`, `read`, or `off`. See [0006 Scope and config](../adr/0006-scope-config.md) and [0009 Agent surface](../adr/0009-agent-surface.md).

The `review` section gives the review period of each kind in days, and the table of defaults holds
the values. See [REQ-456](02-requirements.md) and [REQ-457](02-requirements.md).

The key `idle` gives 300 seconds by default. See [0006 Scope and config](../adr/0006-scope-config.md).

## Defaults

| Item             | Value                                                                    | Reason                                                          |
| ---------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `body`           | 384 bytes required, 512 bytes accepted                                    | The 512 bytes give room for a miss of the model.                 |
| `longform`       | 16 KiB                                                                    | The document does not enter the tree.                            |
| `memory_open`    | `head` 8 KiB, `all` 16 KiB, 32 parts, 24 KiB                              | The answer continues with `offset` and `next`.                   |
| Node             | Target 512 bytes, limit 640 bytes, a cut with a flag                      | The p90 miss is 610 bytes.                                       |
| Input of a merge | Two children, and 1 KiB of `longform` at level 1                          | The input holds no context, so a delete stays derivable.         |
| Budget           | `here` 17 KiB, `directions` 3 KiB                                        | The profile gives no total budget.                               |
| Fold             | `high` is the budget of the block, and `low` is its half. The order is `(due↓, level↑, start↑)` | The order gives one answer. |
| Writer           | `parallel` 6, `batch` 6, effort `off`, 120 calls in an hour               | Thinking gives 8.8 k output tokens for a retelling.              |
| Nudge            | `mode=tools`, 10 calls                                                    | The profile sets it.                                             |
| Review           | 365 days for `decision`, `preference`, and `note`. 180 days for `fact`. 7 days for `task` | A finite default. A write can ask for `never`. |
| GC of `proposed` | 30 days                                                                   | The proposals collect without it.                                |
| `find`           | 10, and 50 for each scope                                                 | The limit gives about 50 records of 500 bytes.                   |
| `cacheTtl`       | `deepseek/*` 2 hours, `anthropic/*` 5 minutes, another model 1 hour        | An idle time above the TTL gives a new snapshot.                 |
| Context          | 65 536 tokens at least                                                    | The slice and the reserve fit.                                   |

## Store

One store holds many profiles, scopes, and records.

A scope is a key in the events. The key has the form `kind:name`, and the store lowercases it before
the write. The store holds no record for a scope, and no event describes one. A scope exists because
a record names its key. See [0006 Scope and config](../adr/0006-scope-config.md), [0006 Scope and config](../adr/0006-scope-config.md), and
[REQ-255](02-requirements.md).

The store has two backends of equal rank: sqlite and jsonl. One store test runs against both. The
store keeps the queue of the compaction jobs. See [0004 Tree and writer](../adr/0004-tree-writer.md).

Each append to the sqlite backend is one transaction, and the backend uses write-ahead logging. The
jsonl backend takes a lock on each append. Several processes write one store. See
[REQ-372](02-requirements.md) to [REQ-377](02-requirements.md).

An export copies the whole store under an exclusive lock and one read transaction, so the copy is
consistent by construction. An import unions the events by `id`, a payload conflict keeps the later
`at`, and the events of a redacted record arrive sanitized. See [0003 Store](../adr/0003-store.md).

| Item     | Value                                       |
| -------- | ------------------------------------------- |
| Config   | `$XDG_CONFIG_HOME/memlens`                  |
| Data     | `$XDG_DATA_HOME/memlens`                    |
| Override | `MEMLENS_STORE` gives another data path     |
| Index    | A separate port over FTS5                   |
| JSONL    | The sidecar file `index.db` holds the index |

## View

The view is a deterministic function of the records, the built nodes, and `storeRev`.

The slice is one `<memory>` block:

```
<memory>
... the policy text ...
<directions>...</directions>
<here scope="...">...</here>
</memory>
```

The policy text stays whole. A direction line gives `[scope] <age|active> · <N> notes · <text>`. A
line of `<here>` is a leaf `#<pos> <date> <body>` or a node `#<a>-<b> <start>..<end> <summary>`. See
[REQ-297](02-requirements.md) and [REQ-298](02-requirements.md).

The compression works on `<directions>` first, then on `<here>`, and the policy text stays whole. A
part above 1.5 times its budget loses the oldest `<here>` lines, and the line
`#<a>-<b> omitted (N lines, compacting)` takes their place. The agent opens the range with
`memory_open`. See [REQ-223](02-requirements.md) to [REQ-229](02-requirements.md).

A `redact` cleans the store. The copy in the session history stays. See [0007 Slice and context](../adr/0007-slice-context.md).

## Addressing

An address is `pos`, `pos-pos`, `scope#pos`, or `scope#pos-pos`. The `pos` is the ordinal in the
scope and stays the same after an amend. The input holds no `#`, and the tool strips one leading `#`
from a copy of the slice. See [REQ-259](02-requirements.md) to [REQ-276](02-requirements.md).

## Tree

A node has the key `(level, start)`. A node of level `L` covers `2^L` consecutive `pos` values, and
`start` is a multiple of `2^L`. A node holds `summary`, `ts_from`, `ts_to`, `bytes`, `input_gen`,
`state`, `built_at`, and `truncated`. The tree has no depth limit, and it needs no dense prefix: a
position with no live record stays empty. See [0004 Tree and writer](../adr/0004-tree-writer.md) and
[REQ-122](02-requirements.md) to [REQ-133](02-requirements.md).

## Frontier

The tree has a frontier: levels of fixed width, and one level covers 2^k leaves. The frontier lists
the lines from the oldest to the newest: the coarse lines first and the fresh records last. A line
holds the address, the range of dates, and the text. See [0004 Tree and writer](../adr/0004-tree-writer.md).

## Erasure

A `hide`, `amend`, or `accept` makes the ancestors of the position dirty. A dirty node does not
render, and its children take its place down to a clean node or a record. The rebuild goes bottom-up,
and one change costs `log2(N)+1` model calls at most. See [REQ-217](02-requirements.md) and
[REQ-218](02-requirements.md).

A `redact` runs in one transaction. It writes the sanitized form into the target. It deletes
the nodes that cover the position and their ancestors, and it deletes the FTS rows. It sanitizes each
card with the id in `for_sources`. See [REQ-219](02-requirements.md) to [REQ-222](02-requirements.md).

The guarantee has four parts. The projection gives no content at once, and the rebuild gives new
retellings. The transaction covers the disk. A prompt that the model already received stays out of
reach. No other derivative holds the text, because the summarizer sees two children and a card sees
`for_sources` only. See [0008 Redaction](../adr/0008-redaction.md).

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
`parallel` with one. A merge gives the model the two children only. See [0004 Tree and writer](../adr/0004-tree-writer.md) and
[0004 Tree and writer](../adr/0004-tree-writer.md).

A job holds a lease of 120 seconds, and a failed job waits 10 seconds, then 60 seconds, then 300
seconds. A job records the `input_gen` of its children, and the store accepts the result only when
`gen` matches that record.

The wake gives the view when the queue is not empty. A position with no built parent gives its
raw records. When a part of the view at the wake is above 1.5 times its budget, the store builds the
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
The context has `required: true` and the order 220. The registration reads `agent.session.id`,
`agent.session.meta.agentPreset`, and `agent.session.meta.cwd`. The preset selects the profile, and
the cwd selects the active scope.

The harness writes the context as a user-role message after the saved history. The message survives a
restart. The harness writes a new message only when the text changes. A compaction deletes the
message, and the plugin renders a new snapshot after the compaction succeeds. See
[REQ-280](02-requirements.md) to [REQ-285](02-requirements.md).

The host gives no `getContextOrder` name for a plugin. The registry names seven built-in contexts, and
the plugin uses the number 220.

## Agent surface

| Tool          | Who        | Effect                                                                  |
| ------------- | ---------- | ----------------------------------------------------------------------- |
| memory_note   | main agent | A new note, or the live note with the same four fields.                 |
| memory_forget | main agent | The records leave the view, and the queues take the rebuilds and cards. |
| memory_find   | main agent | The records with the matching words, each with its `addr`.              |
| memory_open   | main agent | A record with its `longform`, or a block of parts for a range.          |
| memory_review | main agent | The due records, or the count of the reviewed records.                  |
| memory_scope  | main agent | The visible scopes.                                                     |

The tool behavior and the errors are in [REQ-293](02-requirements.md) to
[REQ-352](02-requirements.md). The subagent modes are in [REQ-353](02-requirements.md) to
[REQ-363](02-requirements.md). The nudge is in [REQ-230](02-requirements.md) to
[REQ-237](02-requirements.md). See [0009 Agent surface](../adr/0009-agent-surface.md).

## Human surface

Only the CLI or the GUI can redact and amend. Review uses the `review` event and stays out of the
slice. See [0002 Event log](../adr/0002-event-log.md) and [REQ-024](02-requirements.md).

The console command works alone. The UI core is in the library, and it holds no DOM, no transport, and no style. The console
gives its own styles, and the plugin uses the components of the harness UI. The plugin mounts the tab
`Memory` on the session page and narrows it to one profile. See [08-ui.md](08-ui.md).

## CLI

The binary `memlens` runs without the harness. The commands `note`, `find`, `open`, `forget`,
`review`, `redact`, and `amend` act on a record. The command `scopes` acts on a scope. The commands
`slice`, `compact`, `status`, `check`, and `repair` act on the view and the store. The commands
`export` and `import` move the store. The commands `config` and `ui` set the configuration and start
the console. See [REQ-385](02-requirements.md) to [REQ-412](02-requirements.md).

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
