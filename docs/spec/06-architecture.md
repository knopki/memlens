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
| `amend`   | `target`, and `body` or `longform`                                                                                          | It changes the content. Only the CLI or the GUI.           |
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
`redact` event gives this form, and so does an import of a redacted record. See
[Q-030](03-open-questions.md#q-030) for the merge rule and [Q-037](03-open-questions.md#q-037) for
the `scrub` step.

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
| `amend`   | It patches `body` or `longform`, while `content_cleared` is not set.                    |
| `review`  | It sets `review_at`, and `reviewed_at` becomes its `at`.                                |

A `supersedes` acts one time, at the first `live` state of the note. For each target, the state
becomes the maximum of the state and `hidden`, and `superseded_by` gets the id of the note, if the
field is empty. A later hide or delete of this note cancels nothing. See [D-029](04-decisions.md).

The state order is `live`, `hidden`, `proposed`, `deleted`. The ops `hide` and `dismiss` raise the
value, and only an `accept` lowers it. See [D-031](04-decisions.md).

A `hide` event takes a record out of the view, the search, and the compression. A proposed record
keeps the state `proposed` and stays in the review queue. An `accept` event clears the effect of an
earlier `hide` event, and the record enters the view again. See [D-032](04-decisions.md).

A `redact` event clears `body` and `longform` for good, and a later `amend` does not apply. An event
with `redacted: true` gives no content. See [D-030](04-decisions.md).

## Catalog

The catalog has one scope for each profile: `__catalog__:<profile>`. A card is a `note` event in this
scope with `kind: "card"`, `for_scope`, and `for_sources`. See [D-034](04-decisions.md).

One card covers one scope and one session. Its input is the `body` of each live record of that scope
and session. A record with the state `proposed`, `hidden`, or `deleted` does not enter the card.

A rebuild writes a new card with the old card in `supersedes`. The projection hides the old card, and
the catalog tree marks the ancestors of the old card dirty. The text of the old card stays. See
[D-033](04-decisions.md).

A `hide`, `redact`, `amend`, or supersede of a source marks each card of that source dirty. The store
builds the card again from the live records that stay. See [D-035](04-decisions.md).

A card with a redacted id in `for_sources` gets the sanitized form: an empty `body`, a null `longform`,
and `redacted: true`. A retelling has no phrase to cut, so the card goes as a whole. The placeholder
`[redacted]` appears in the console and the view only. See [Q-037](03-open-questions.md#q-037) for the
`scrub` step.

## Store

The store has two backends of equal rank: sqlite and jsonl. One store test runs against both.

| Item     | Value                                       |
| -------- | ------------------------------------------- |
| Config   | `$XDG_CONFIG_HOME/memlens`                  |
| Data     | `$XDG_DATA_HOME/memlens`                    |
| Override | `MEMLENS_STORE` gives another data path     |
| Index    | A separate port over FTS5                   |
| JSONL    | The sidecar file `index.db` holds the index |

## View

The view is a deterministic function of the notes, the built nodes, and the store version. The slice
is a snapshot that the store materializes, with an `id` and a `scopes` field. The `sessions` record holds the
pointer to the current snapshot.

The plugin gives the slice to the harness as `systemPrompt.context`. The slice updates at a new
session, at a compaction, and after an idle time longer than the model cache TTL.

## Merge

A merge is a union of events by id. The projection converges for any order of arrival.

## Addressing

A note has the address `#id`. A range of notes has the address `#a-b`. The agent gets one note or one
range by its address. The address names the `note` event, and it stays the same after an amend. See
[D-027](04-decisions.md).

## Frontier

The tree has a frontier: levels of fixed width, and one level covers 2^k leaves. The newest level
holds the detail, and the older levels hold the short form. The frontier geometry comes from the
prior art. See [D-018](04-decisions.md).

## Writer

The writer is a background compactor. It makes the retellings in batches and in parallel jobs. The
defaults come from the measurements: effort off, 6 nodes in a batch, and up to 8 jobs. See
[D-019](04-decisions.md).

The writer takes the most overdue pair first. It retries a line that is not shorter than its source,
and it refuses a line that does not shrink. See [REQ-050](02-requirements.md) and
[REQ-051](02-requirements.md).

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
| write         | main agent | A new note. Outside a write scope the note becomes `proposed`. |
| hide          | main agent | The note leaves the view.                                      |
| memory_review | main agent | One short review answer.                                       |

A subagent has no separate tool. It writes only new notes as `proposed`, and a line about the write
goes to the report of the parent. A subagent cannot hide a note and cannot review a note.

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

The shape of a scope, the form of the map, the snapshot fields, and the tree rules are open. See
[03-open-questions.md](03-open-questions.md), from Q-009 to Q-033.
