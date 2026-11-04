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

| Op        | Payload                                                                                                                     | Effect                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `note`    | `body`, `kind`, `ts`, `review_at`, `proposed`, `session`, `turn`, `preset`, and the optional `longform`, `refs`, `supersedes`, `for_scope`, `for_sources` | It writes a note.                                          |
| `amend`   | `target`, and one or more of `body`, `longform`, and `scope`                                                                | It changes the content or the scope. Only the CLI or the GUI. |
| `hide`    | `target`, `reason`                                                                                                          | The note leaves the view. The content stays.               |
| `redact`  | `target`, `reason`                                                                                                          | The content of the note becomes empty. Only the CLI or the GUI. |
| `review`  | `target`, `review_at`                                                                                                       | It gives the new review date.                              |
| `accept`  | `target`                                                                                                                    | A proposed note becomes `live`.                            |
| `dismiss` | `target`, `reason`                                                                                                          | A proposed note becomes `deleted`.                         |

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

| Event     | Effect                                                                                  |
| --------- | --------------------------------------------------------------------------------------- |
| `note`    | With the state `live`, it applies its `supersedes`.                                     |
| `accept`  | It makes `proposed` to `live` at an actual transition, and it applies the `supersedes`. |
| `hide`    | The state becomes the maximum of the state and `hidden`.                                |
| `dismiss` | The state becomes the maximum of the state and `deleted`.                               |
| `redact`  | The state becomes `deleted`, and `content_cleared` becomes true.                        |
| `amend`   | It patches `body` or `longform` while `content_cleared` is not set, and it moves the record to the key in `scope`. |
| `review`  | It sets `review_at`, and `reviewed_at` becomes its `at`.                                |

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

The catalog has one scope for each profile: `__catalog__:<profile>`. A card is a `note` event in this
scope with `kind: "card"`, `for_scope`, and `for_sources`. A card carries `body`, `kind`, `ts`,
`session`, `for_scope`, and `for_sources`, and it carries no `review_at`, `proposed`, `turn`, or
`preset`. See [D-034](04-decisions.md) and [D-037](04-decisions.md).

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

The configuration is a TOML file. The statement [S-036](../statements.md#s-036) gives a part of it. See
[D-045](04-decisions.md).

| Section           | Keys                                                      |
| ----------------- | --------------------------------------------------------- |
| `store`           | `backend` (`sqlite` or `jsonl`), `path`                   |
| `profile.<name>`  | `scopes`, `budget`, `subagents`                           |

A `path` from `--store` wins over `MEMLENS_STORE`, and the environment wins over the file.

A profile lists its scopes as keys, and `*` matches the rest of a key. The budget gives `here` and
`directions` in bytes, and the two are independent: `here` limits the tree of the current project and
`directions` limits the tree of the catalog. The subagent mode is `propose`, `read`, or `off`. See
[D-046](04-decisions.md) and [D-047](04-decisions.md).

## Store

A scope is a key in the events. The store holds no record for a scope, and no event describes one. A
scope exists because a record names its key. See [D-042](04-decisions.md).

The store has two backends of equal rank: sqlite and jsonl. One store test runs against both. The
store keeps the queue of the compaction jobs. See [D-054](04-decisions.md).

| Item     | Value                                       |
| -------- | ------------------------------------------- |
| Config   | `$XDG_CONFIG_HOME/memlens`                  |
| Data     | `$XDG_DATA_HOME/memlens`                    |
| Override | `MEMLENS_STORE` gives another data path     |
| Index    | A separate port over FTS5                   |
| JSONL    | The sidecar file `index.db` holds the index |

## View

The view is a deterministic function of the records, the built nodes, and `storeRev`.

The slice is one `<memory>` block with three parts:

```
<memory>
<how-to>...</how-to>          the static policy
<directions>...</directions>  each scope of the profile, aged by activity
<here scope="...">...</here>  the frontier of the active scope
</memory>
```

Only the text travels. The nine fields of S-042 have no record. [Q-055](03-open-questions.md) gives
the choice. The reason of a trigger is `session-start`, `ttl`, `compaction`, or `redact`. Review data
does not enter the slice. See [REQ-178](02-requirements.md) to [REQ-181](02-requirements.md).

The plugin gives the text to the harness as `systemPrompt.context`, and the text stays the same until
the next snapshot. A new snapshot follows a new session, a compaction, an idle time longer than the
cache TTL, and a redact. See [REQ-021](02-requirements.md).

The store of memlens holds no snapshot. The plugin renders the text from the store at a trigger, and
the session history of the harness keeps the copy. On each later assembly the plugin reads the last
snapshot from the history and gives that text again. A `redact` cleans the store, and the next trigger
renders the text again. The copy in the session history stays. See [D-050](04-decisions.md),
[D-051](04-decisions.md), and [D-052](04-decisions.md).

## Merge

A merge is a union of events by id. The projection converges for any order of arrival.

## Addressing

A note has the address `#pos`. A range of notes has the address `#a-b`. The agent gets one note or one
range by its address. The address is the `pos` of the note event, so it stays the same after an amend.
See [D-027](04-decisions.md).

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
store. The defaults come from the measurements: effort off, 6 lines in a call, and 6 calls at one
time. See [D-019](04-decisions.md) and [D-054](04-decisions.md).

A job holds a lease of 120 seconds, and a failed job waits 10 seconds, then 60 seconds, then 300
seconds. A job records the `input_gen` of its children, and the store accepts the result only when
`gen` matches that record.

The compaction starts after a write, at a wake, at the command `memlens compact`, and at the idle
timer. The wake gives the view when the queue is not empty. A position with no built parent gives
its raw records. When the view at the wake is above 1.5 times the budget, the store builds the
unbuilt nodes. The deadline of the build is 10 seconds, and the render gives the view at the
deadline.

The writer builds each dirty node. A node is dirty when a source changes or becomes dirty, and an
import that puts the records in another order makes the tree dirty. The writer takes the node with the
highest `due` first, and a node waits for its children. See [D-041](04-decisions.md).

The writer retries a line that is not shorter than its source, and it refuses a line that does not
shrink. See [REQ-051](02-requirements.md).

## Freeze and branch

The slice stays the same for the whole session. A session is a branch of a profile, and the branch
merges into the trunk at close and at idle. The merge of a branch serves several machines, not one
machine.

An import and a merge are idempotent by `idem`. A note can supersede an earlier note. The index is
a cache over the log: the store rebuilds it from the log after a loss. See
[REQ-057](02-requirements.md), [REQ-058](02-requirements.md), and [REQ-059](02-requirements.md).

## Agent surface

| Tool          | Who        | Effect                                                         |
| ------------- | ---------- | -------------------------------------------------------------- |
| write         | main agent | A new note. Outside the profile it is `proposed`.              |
| hide          | main agent | The note leaves the view.                                      |
| memory_review | main agent | One short review answer.                                       |

Each scope of a profile accepts a write. A write to a scope outside the profile gives a `proposed`
note, and a human decides about it. See [REQ-160](02-requirements.md) and
[REQ-026](02-requirements.md).

A subagent has no separate tool. In the mode `propose` it writes only new notes as `proposed`, and a
line about the write goes to the report of the parent. A subagent cannot hide a note and cannot review
a note.

## Human surface

Only the CLI or the GUI can redact and amend. A redacted note stays redacted, and an import does not
give the content back. Review uses the `review` event and stays out of the slice. The record keeps
`review_at` only, the date of the next review. See [D-025](04-decisions.md).

The console `memlens ui` works alone. In the harness the console runs in a session mode on the same
view models.

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

The form of the direction map, the index port, and the merge of the configuration are open. The
retelling prompt, the snapshot fields, and the tool surfaces are open. See
[03-open-questions.md](03-open-questions.md).
