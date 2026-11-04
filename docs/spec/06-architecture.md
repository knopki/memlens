# Architecture

Status: draft. The scaffold builds and the tests pass. No part does work yet.

## Stack

TypeScript 7 on Node.js with pnpm workspaces. biome lints and formats. vitest runs the tests. esbuild
makes the bundles. prek runs the git hooks. See [D-011](04-decisions.md). The tool versions come from
`mise.toml`. See [D-008](04-decisions.md).

## Layout

| Path                  | Package               | Role                                      |
| --------------------- | --------------------- | ----------------------------------------- |
| `packages/core`       | `@memlens/core`       | The headless library.                     |
| `packages/cli`        | `@memlens/cli`        | The CLI frontend. Binary `memlens`.       |
| `packages/dsh-plugin` | `@memlens/dsh-plugin` | The DSH plugin. Identifier `dsh-memlens`. |

## Dependency direction

The CLI depends on the library. The plugin depends on no package yet. The library depends on nothing.
The test `packages/core/tests/isolation.test.ts` holds this rule. See [REQ-007](02-requirements.md).

Assumption: the plugin will use the library functions. See [Q-006](03-open-questions.md#q-006).

## Interfaces

| Part    | Interface            | State                                    |
| ------- | -------------------- | ---------------------------------------- |
| Library | `NAME`               | A constant only. No function yet.        |
| CLI     | `main(argv)`         | Gives the usage text and the exit codes. |
| Plugin  | `name`, `apply(ctx)` | Registers no contribution.               |

## Build

| Package | Tool    | Output                                     |
| ------- | ------- | ------------------------------------------ |
| core    | `tsc`   | `dist/index.js` and `dist/index.d.ts`      |
| cli     | esbuild | `dist/cli.js`, one bundle with a shebang   |
| plugin  | esbuild | `lib/index.js`, one bundle                 |
| plugin  | `tsc`   | `lib/index.d.ts` in a declaration-only run |

`pnpm build` runs the builds in the dependency order of the workspace. The plugin keeps the packages
external, because the harness gives them at run time.

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

## Data

TBD. No statement about storage, format, or volume yet.

## Limits

TBD. No statement about latency, volume, or cost yet.

## Postponed items

TBD. Each postponed item gets an identifier and a reason in
[01-goals-nongoals.md](01-goals-nongoals.md).
