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
give the content back. Review uses `review_at` and `reviewed_at` and stays out of the slice.

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

The shape of a scope, the form of the map, the snapshot fields, the event types, and the tree rules
are open. See [03-open-questions.md](03-open-questions.md), from Q-009 to Q-023.
