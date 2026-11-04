# Architecture

Status: draft. The specification is the source of truth. The repository has a scaffold only.

## Shape

The memory is a log of curated notes. A tree of retellings is a cache above the log. Two levels share
one engine:

- The notes of a scope make the leaves.
- The catalog of cards `[scope] state` is the level above the notes. It has its own tree and belongs
  to one profile.

The agent reads one map of directions: the registry and the catalog in one `<directions>` block.

## Parts

| Path                  | Package               | Role                                                                 |
| --------------------- | --------------------- | -------------------------------------------------------------------- |
| `packages/core`       | `@memlens/core`       | The engine: store ports, the projection, the tree build, the slice.  |
| `packages/cli`        | `@memlens/cli`        | The terminal: `memlens ui`, redact, amend, import, export.           |
| `packages/dsh-plugin` | `@memlens/dsh-plugin` | The harness surface: the entry points `.` and `./preset`, the tools. |

The CLI depends on the library. The plugin depends on the library. The library depends on nothing.
The test `packages/core/tests/isolation.test.ts` holds this rule. See [REQ-007](02-requirements.md).

## Stack

TypeScript 7 on Node.js with pnpm workspaces. biome lints and formats. vitest runs the tests. esbuild
makes the bundles. prek runs the git hooks. See [D-011](04-decisions.md). The tool versions come from
`mise.toml`. See [D-008](04-decisions.md).

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

The log holds immutable events. An event has `id` (ULID), `at`, `op`, and `scope`. The payload belongs
to the op.

| Op        | Payload                                                                                                                                                   | Effect                                                          |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `note`    | `body`, `kind`, `ts`, `review_at`, `proposed`, `session`, `turn`, `preset`, and the optional `longform`, `refs`, `supersedes`, `for_scope`, `for_sources` | It writes a note.                                               |
| `amend`   | `target`, and one or more of `body`, `longform`, and `scope`                                                                                              | It changes the content or the scope. Only the CLI or the GUI.   |
| `hide`    | `target`, `reason`                                                                                                                                        | The note leaves the view. The content stays.                    |
| `redact`  | `target`, `reason`                                                                                                                                        | The content of the note becomes empty. Only the CLI or the GUI. |
| `review`  | `target`, `review_at`                                                                                                                                     | It gives the new review date.                                   |
| `accept`  | `target`                                                                                                                                                  | A proposed note becomes `live`.                                 |
| `dismiss` | `target`, `reason`                                                                                                                                        | A proposed note becomes `deleted`.                              |

A card is a `note` event with `kind: "card"`, `for_scope`, and `for_sources`. The log has no card op.

An event has two times. `at` is the time of the log, and `ts` is the time of the write of a note. See
[D-024](04-decisions.md).

Only the `note` event carries `session`, `turn`, and `preset`. The agent gives them when it calls the
tool. See [REQ-085](02-requirements.md).

`pos` is not a field of an event. It is the ordinal of the creating event in the log of one store. The
first `note` has `pos` 0. A `pos` is local to one store, and an export holds no `pos`.

A `supersedes` stays inside one scope. The store refuses a cross-scope `supersedes` with the error
`CrossScopeSupersede`.

A redacted event keeps its `id` and gets `redacted: true`, an empty `body`, and a null `longform`. A
`redact` event gives this form, and so does an import of a redacted record. The model has no `scrub`
step. See [D-036](04-decisions.md) and [Q-030](03-open-questions.md#q-030) for the merge rule.

## Projection

The projection builds the set of records from the log in two passes. It is deterministic, and it
orders the events by `(at, id)`. The order of arrival and a local `pos` change nothing. See
[D-028](04-decisions.md).

Pass 1 makes one record for each `note` event. The record copies each payload field of the event and
sets `recorded_at = at`. The state is `proposed` for a proposed note and `live` for another note.

Pass 2 applies the operations in the same order.

| Event     | Effect                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| `note`    | With the state `live`, it applies its `supersedes`.                                                                |
| `accept`  | It makes `proposed` to `live` at an actual transition, and it applies the `supersedes`.                            |
| `hide`    | The state becomes the maximum of the state and `hidden`.                                                           |
| `dismiss` | The state becomes the maximum of the state and `deleted`.                                                          |
| `redact`  | The state becomes `deleted`, and `content_cleared` becomes true.                                                   |
| `amend`   | It patches `body` or `longform` while `content_cleared` is not set, and it moves the record to the key in `scope`. |
| `review`  | It sets `review_at`, and `reviewed_at` becomes its `at`.                                                           |

A `supersedes` acts one time, at the first `live` state of the note. For each target, the state
becomes the maximum of the state and `hidden`, and `superseded_by` gets the id of the note, if the
field is empty. A later hide or delete of this note cancels nothing. See [D-029](04-decisions.md).

The state order is `live`, `hidden`, `proposed`, `deleted`. The ops `hide` and `dismiss` raise the
value, and only an `accept` lowers it. See [D-031](04-decisions.md).

A `hide` event takes a record out of the view, the search, and the compression. A proposed record
keeps the state `proposed` and stays in the review queue. An `accept` event clears the effect of an
earlier `hide` event, and the record enters the view again. See [D-032](04-decisions.md).

A `redact` event clears `body` and `longform` for good, and a later `amend` changes no content. An event
with `redacted: true` gives no content. See [D-030](04-decisions.md).

## Catalog

The catalog has one scope for each profile: `__catalog__:<profile>`. The key is hidden from the
agent. See [REQ-274](02-requirements.md). A card is a `note` event in this scope with `kind: "card"`,
`for_scope`, and `for_sources`. A card carries `body`, `kind`, `ts`, `session`, `for_scope`, and
`for_sources`, and it carries no `review_at`, `proposed`, `turn`, or `preset`. See
[D-034](04-decisions.md) and [D-037](04-decisions.md).

One card covers one scope and one session. A session end and a compaction build the card of each scope
with records of the session. Its input is the `body` of each live record of that scope and session. A
record with the state `proposed`, `hidden`, or `deleted` does not enter the input.

The model writes the body of the card from the input, and the body is 512 bytes maximum. The build
retries the model when the answer holds no text or more than 512 bytes. Without a model answer, the
store joins the three last bodies, ordered by `ts`, with `; `, and cuts the text at a word boundary
to 512 bytes. A scope with no live record gives no card. See [REQ-190](02-requirements.md) to
[REQ-199](02-requirements.md).

A rebuild writes a new card with the old card in `supersedes`. The projection hides the old card, and
the catalog tree marks the ancestors of the old card dirty. The text of the old card stays. See
[D-033](04-decisions.md).

A `hide`, `redact`, `amend`, or supersede of a source marks each card of that source dirty. An `amend`
with a `scope` field marks the card of the old scope and the card of the new scope dirty. The store
builds the card again from the live records that stay. See [D-035](04-decisions.md).

A card with a redacted id in `for_sources` gets the sanitized form: an empty `body`, a null `longform`,
and `redacted: true`. A retelling has no phrase to cut, so the card goes as a whole. The placeholder
`[redacted]` appears in the console and the view only, and no event holds it.

## Configuration

The CLI reads a TOML file. The harness reads the plugin config in `cordis.patch.yml` and the agent
preset. The plugin merges three layers: the TOML file, the profile patch, and the preset patch. The patch
wins over the TOML, and the preset wins over the profile. An array replaces an array. See
[D-065](04-decisions.md).

| Layer        | File                       | Keys                                                                 |
| ------------ | -------------------------- | -------------------------------------------------------------------- |
| CLI and base | `$XDG_CONFIG_HOME/memlens` | `store`, `profile.<name>`, `scope_default`, `nudge`, `writer`        |
| Profile      | `cordis.patch.yml`         | `store`, `defaultProfile`, `writer`, `nudge`, `language`, `cacheTtl` |
| Preset       | the agent preset           | `profile`, `writer`, `budget`                                        |

The `store` key of the patch sets the same store as the TOML `store` section and `MEMLENS_STORE`. The
plugin takes the patch first, then `MEMLENS_STORE`, then the TOML file. The CLI takes `--store` first,
then `MEMLENS_STORE`, then the TOML file. The flag and the patch belong to different programs. The
`writer` section gives `provider`,
`model`, `effort`, `mode`, `batch`, and `maxCallsPerHour`. The `mode` is `parallel`, `batch`, or `auto`,
and the default is `auto`. The `cacheTtl` map gives a duration for a model glob. The most specific glob
wins. The `language` key gives the language that the prompt recommends for the notes. The default is
`en`, because the FTS support is better. See [S-067](../statements.md#s-067) and [S-068](../statements.md#s-068).

The `nudge` section gives `mode` and `tool_calls` in the patch. The TOML file gives the other nudge keys.
The `[scope_default]` section gives the scope rules and the fallback key. The rules go in order, and the
first match gives the active scope. The rules match the repository remote, the path, or the workspace.
See [REQ-262](02-requirements.md), [REQ-263](02-requirements.md), [REQ-272](02-requirements.md), and
[D-060](04-decisions.md).

A profile lists its scopes as keys, and `*` matches any text of the kind or of the name. The budget gives
`here` and `directions` in bytes. The two budgets are independent. The
subagent mode is `propose`, `read`, or `off`. See [D-046](04-decisions.md) and [D-047](04-decisions.md).

For the CLI, a `path` from `--store` wins over `MEMLENS_STORE`, and the environment wins over the TOML
file. The key `idle` gives 300 seconds by default. See [D-045](04-decisions.md).

## Store

A scope is a key in the events. The key has the form `kind:name`, and the grammar covers the keys that
the agent sees. The store lowercases a key before the write. See [REQ-278](02-requirements.md). The store holds no record for a scope, and no event describes one. A scope exists
because a record names its key. See [D-042](04-decisions.md), [D-061](04-decisions.md), and
[REQ-255](02-requirements.md).

The store has two backends of equal rank: sqlite and jsonl. One store test runs against both. The
store keeps the queue of the compaction jobs. See [D-054](04-decisions.md).

Each append to the sqlite backend is one transaction, and the backend uses write-ahead logging. The
jsonl backend takes a lock on each append. Several processes write one store. Two sessions write one
scope, the `pos` stays monotonic, and each session renders its own snapshot. See
[REQ-372](02-requirements.md) to [REQ-377](02-requirements.md).

An export copies the whole store under an exclusive lock and one read transaction, so the copy is
consistent by construction. An import unions the events by `id`, a payload conflict keeps the later
`at`, and the events of a redacted record arrive sanitized. See [D-071](04-decisions.md).

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

The policy text stays whole. A direction line gives `[scope] <age|active> · <N> notes · <text>`. A fresh
scope can add detail lines. A line of `<here>` is a leaf `#<pos> <date> <body>`, a node
`#<a>-<b> <start>..<end> <summary>`, or a card `#<pos> <date> [scope] <text>`. See
[REQ-297](02-requirements.md) and [REQ-298](02-requirements.md).

The frontier tiles its range with no gap and no overlap. A nested block does not render. The agent opens a
node with `memory_open`, and the tool gives the two child lines. See [REQ-299](02-requirements.md).

The compression works on `<directions>` first, then on `<here>`, and the policy text stays whole. An old
line of `<directions>` gives one line, and the compression of `<here>` stops at 60 percent of the budget.
A part above 1.5 times its budget loses the oldest `<here>` lines, and the line
`#<a>-<b> omitted (N lines, compacting)` takes their place. The `<directions>` block keeps its lines.
The agent opens the range with `memory_open`. See [REQ-223](02-requirements.md) to
[REQ-229](02-requirements.md).

The text travels in `systemPrompt.context`. The session history keeps it. The plugin reads the last
context message and gives that text until the next trigger. A trigger is a fresh session, a compaction
after success, and an idle time above the TTL. A process restart gives the same text. See
[REQ-021](02-requirements.md), [REQ-188](02-requirements.md), and [D-064](04-decisions.md).

A `redact` cleans the store. The copy in the session history stays. See [D-052](04-decisions.md).

## Merge

A merge is a union of events by id. The projection converges for any order of arrival.

## Addressing

An address is `pos`, `pos-pos`, `scope#pos`, or `scope#pos-pos`. An address with no scope names the
active scope, and an address with a scope names a record of that scope. The `pos` stays the same after
an amend. The input holds no `#`, and the tool strips one leading `#` from a copy of the slice. See
[D-027](04-decisions.md), [REQ-259](02-requirements.md) to [REQ-261](02-requirements.md), and
[REQ-273](02-requirements.md) to [REQ-275](02-requirements.md). The `pos` is the ordinal in the
store, and the scope narrows the count to that scope. See [REQ-276](02-requirements.md).

## Tree

A node has the key `(level, start)`. A node of level `L` covers `2^L` consecutive `pos` values, and
`start` is a multiple of `2^L`. A leaf is the record itself, and a node starts at level 1. The tree
has no depth limit. The tree needs no dense prefix: a position with no live record is
empty, and the hole stays in the geometry. See [D-038](04-decisions.md).

A node holds `summary`, `ts_from`, `ts_to`, `bytes`, `input_gen`, `state`, `built_at`, and
`truncated`. The state is `built` or `dirty`. A summary line targets 512 bytes and has a limit of
640 bytes. See [D-039](04-decisions.md). The fields `ts_from` and `ts_to` come from the `ts` values of
the covered notes. See [REQ-131](02-requirements.md).

## Frontier

The tree has a frontier: levels of fixed width, and one level covers 2^k leaves. One level gives one
line of the map, and the frontier renders no empty position.

The frontier lists the lines from the oldest to the newest: the coarse lines first and the fresh
records last. A line holds the address, the range of dates, and the text. The last lines are the
records that no node covers yet, and the writer can add several. See [D-040](04-decisions.md).

The frontier geometry comes from the prior art. See [D-018](04-decisions.md).

## Erasure

A `hide`, `amend`, or `accept` makes the ancestors of the position dirty. A dirty node does not render,
and its children take its place down to a clean node or a record. The rebuild goes bottom-up, and one
change costs `log2(N)+1` model calls at most. See [REQ-217](02-requirements.md) and
[REQ-218](02-requirements.md).

A `redact` runs in one transaction. It writes the sanitized form into the target, deletes the nodes
that cover the position and their ancestors, and deletes the FTS rows. Each card with the id in
`for_sources` gets the sanitized form, and its catalog nodes and ancestors go. See
[REQ-219](02-requirements.md) to [REQ-222](02-requirements.md).

The guarantee has four parts. The projection gives no content at once, and the rebuild gives new
retellings. The transaction covers the disk. A prompt that the model already received stays out of
reach. No other derivative holds the text, because the summarizer sees two children and a card sees
`for_sources` only. See [D-055](04-decisions.md).

## Fold

The view is a tiling of `[0, total)` with non-overlapping blocks. The fold merges built pairs while
the view is above `high` and stops at `low = high/2`. The budget of the part gives `high`. The fold
builds nothing. See [REQ-161](02-requirements.md), [REQ-167](02-requirements.md), and
[REQ-177](02-requirements.md).

A merge needs two neighbors of one level, a `start` that is a multiple of `2^(level+1)`, and a built
parent with a fresh input. The pair takes the priority `due = (total - (start + 2^(level+1) - 1)) /
2^level`, and the choice goes by `due`, then `level`, then `start`. See [D-048](04-decisions.md).

The fold calls no model for two empty children or for one empty child. It takes an empty block or the
line of the other child. The model works only on two non-empty children, and the shrink check applies
to that merge only.

Each batch extends the prefix of the view, so the prompt cache of the model survives. The cache key is
`epoch = hash(storeRev, sorted built nodes)`. See [D-049](04-decisions.md).

## Writer

The writer is a background compactor. It runs outside the agent loop, from a queue of jobs in the
store. The effort is off by default. A run takes one form. `parallel` makes 6 calls of one line with
one prefix of the context. `batch` makes one call of up to 6 lines in the form `#a-b: line`, and a
broken answer gives one retry with the error, then `parallel`. `auto` follows the family of the model:
`batch` without a cache, and `parallel` with one. See [D-054](04-decisions.md) and
[D-059](04-decisions.md).

A merge gives the model the two children only, and no context around them. The `writer` section sets
the limit of the calls on the store: 120 in one hour by default. A call above the limit waits, and the
job returns to the queue. See [REQ-248](02-requirements.md), [REQ-252](02-requirements.md), and
[REQ-254](02-requirements.md).

A job holds a lease of 120 seconds, and a failed job waits 10 seconds, then 60 seconds, then 300
seconds. A job records the `input_gen` of its children, and the store accepts the result only when
`gen` matches that record.

The compaction starts after a write, at a wake, at the command `memlens compact`, and at the idle
timer. The wake gives the view when the queue is not empty. A position with no built parent gives
its raw records. When a part of the view at the wake is above 1.5 times its budget, the store builds
the unbuilt nodes. The deadline of the build is 10 seconds, and the render gives the view at the
deadline. The `store` section gives the idle time of the compaction. The `writer` section gives the mode
of the compactor.
See [REQ-214](02-requirements.md) and [REQ-216](02-requirements.md).

The writer builds each dirty node. A node is dirty when a source changes or becomes dirty, and an
import that puts the records in another order makes the tree dirty. The writer takes the node with the
highest `due` first, and a node waits for its children. See [D-041](04-decisions.md).

The writer retries a line that is not shorter than its source, and it refuses a line that does not
shrink. See [REQ-051](02-requirements.md).

The four texts of the calls are in [09-prompts.md](09-prompts.md). A merge accepts a line up to 640
bytes with no retry. A retry asks for 0.75 times the target, and a merge makes three attempts. The
shortest line stays. A line above 640 bytes cuts at a word boundary, and the node takes
`truncated: true`. See [REQ-432](02-requirements.md) to [REQ-438](02-requirements.md).

## Freeze and branch

The slice stays the same for the whole session. A session is a branch of a profile, and the branch
merges into the trunk at close and at idle. The merge of a branch serves several machines, not one
machine.

An import and a merge are idempotent by `idem`. A note can supersede an earlier note. The index is
a cache over the log: the store rebuilds it from the log after a loss. See
[REQ-057](02-requirements.md), [REQ-058](02-requirements.md), and [REQ-059](02-requirements.md).

## Harness surface

The plugin registers the slice as `systemPrompt.context`. It does not use a system prompt section: a
change of the section invalidates the whole cached prefix. See [D-064](04-decisions.md).

The plugin registers one context for each agent at `agent/created`. The event gives the agent scope. The
context has `required: true` and the order 220. The registration reads `agent.session.id`,
`agent.session.meta.agentPreset`, and `agent.session.meta.cwd`. The preset selects the profile, and the
cwd selects the active scope.

The harness writes the context as a user-role message after the saved history. The message survives a
restart. The harness writes a new message only when the text changes. A compaction deletes the message,
and the plugin renders a new snapshot after the compaction succeeds. See [REQ-280](02-requirements.md) to
[REQ-285](02-requirements.md).

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
| memory_scope  | main agent | The visible scopes, or a new `title` and `description`.                 |

Each scope of a profile accepts a write. A write to a scope outside the profile gives a `proposed`
note, and a human decides about it. See [REQ-160](02-requirements.md) and
[REQ-026](02-requirements.md).

A `forget` to a record of a scope outside the profile gives a proposal. A `review` and a
`scope describe` give the error `NotAllowed`. See [REQ-349](02-requirements.md) to
[REQ-352](02-requirements.md).

The answer of `memory_open` is 24 KiB at most, and one call visits 4096 nodes at most. A range that
the budget stops comes back with `needsExpansion`, and the next call opens it. `depth` gives the level
of detail only. See [D-068](04-decisions.md).

A subagent has no separate tool. In the mode `propose` it gets `memory_find`, `memory_open`, the
scope list, and `memory_note`. A write is always `proposed`, and the answer gives the `addr` and the
line `Proposed to your parent: …`. The proposals of one child collect under its session id. The
report of the parent gets one line for each proposal: the tag `[memory proposals from <session id>]`,
the `addr`, and the `body`. A human accepts or dismisses in the console, and an unaccepted proposal gets
a `dismiss` after 30 days. The event log keeps the content. See [D-069](04-decisions.md).

The nudge is one line at the start of a turn, after the frozen slice, so the cache keeps its prefix.
A write of a note resets the counters. The modes are `tools`, `turns`, `expensive`, and `off`. The
`[nudge]` section gives the counts and the text. The default text names no unit of the count. See
[REQ-230](02-requirements.md) to [REQ-237](02-requirements.md) and [D-058](04-decisions.md).

## Human surface

Only the CLI or the GUI can redact and amend. A redacted note stays redacted, and an import does not
give the content back. Review uses the `review` event and stays out of the slice. The record keeps
`review_at` only, the date of the next review. See [D-025](04-decisions.md).

The console `memlens ui` works alone. In the harness the console runs in a session mode on the same
view models. The UI core is in the library, and it holds no DOM, no transport, and no style. The
console gives its own styles, and the plugin uses the components of the harness UI. The plugin
mounts the tab `Memory` on the session page and narrows it to one profile. See [08-ui.md](08-ui.md).

## CLI

One binary `memlens` runs without the harness. The exit code 0 marks a success, and 1 marks an error
of the data. The code 2 marks an error of the usage, and 3 marks a refusal by a policy. See
[REQ-385](02-requirements.md) to [REQ-412](02-requirements.md).

The commands `note`, `find`, `open`, `forget`, `review`, `redact`, and `amend` act on a record. The
command `scopes` acts on a scope. The commands `slice`, `compact`, `status`, `check`, and `repair`
act on the view and the store. The commands `export` and `import` move the store. The commands
`config` and `ui` set the configuration and start the console.

## Code markup

Each source file has one `#region moduleContract` block at the top. The block gives the purpose, the
scope, and the invariants of the module. Each public or non-trivial entity has one region. See
[C-009](01-goals-nongoals.md).

The code writes short debug messages with key-value data. The messages act as observable contracts.

## Client and backend

There is no client yet. When a client appears, it goes in its own package and in its own bundle. A
file must not mix client code and backend code. See [C-012](01-goals-nongoals.md).

## Checks

| Check             | Command              |
| ----------------- | -------------------- |
| Build             | `pnpm run build`     |
| Type check        | `pnpm run typecheck` |
| Tests             | `pnpm run test`      |
| Code and format   | `pnpm run lint`      |
| Document language | `pnpm run lint:docs` |
| All of the above  | `pnpm run verify`    |

The project keeps the linter in `scripts/vendor/`. See [D-009](04-decisions.md). The manifest has a
test. See [D-010](04-decisions.md).

## Open points

The retelling prompt and the index port are open. The review period of each `kind`, the `idem` of a
write, the default write scope, and the name of the `due` filter are open. The policy text of S-067
names four tools, and `memory_scope` needs its sentence. See [03-open-questions.md](03-open-questions.md).
