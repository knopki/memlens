# Architecture

Status: draft. The scaffold builds and the tests pass. No part does work yet.

## Stack

TypeScript on Node.js. pnpm workspaces. `tsc` builds the library and the CLI. `tsdown` builds the
plugin. See [D-005](04-decisions.md). The tool versions come from `mise.toml`. See [D-008](04-decisions.md).

## Layout

| Path | Package | Role |
|---|---|---|
| `packages/core` | `@memlens/core` | The headless library. |
| `packages/cli` | `@memlens/cli` | The CLI frontend. Binary `memlens`. |
| `packages/dsh-plugin` | `@memlens/dsh-plugin` | The DSH plugin. Identifier `dsh-memlens`. |

## Dependency direction

The CLI depends on the library. The plugin depends on no package yet. The library depends on nothing.

Assumption: the plugin will use the library functions. See [Q-006](03-open-questions.md#q-006).

## Interfaces

| Part | Interface | State |
|---|---|---|
| Library | `NAME` | A constant only. No function yet. |
| CLI | `main(argv)` | Gives the usage text and the exit codes. |
| Plugin | `name`, `apply(ctx)` | Registers no contribution. |

## Build

`pnpm build` runs `tsc` in the library and the CLI, and `tsdown` in the plugin. The command `pnpm -r`
follows the dependency order of the workspace.

The plugin writes `lib/index.js` and `lib/index.d.ts`. The other packages write `dist/`.

## Checks

| Check | Command |
|---|---|
| Build | `pnpm run build` |
| Type check | `pnpm run typecheck` |
| Tests | `pnpm run test` |
| Document language | `pnpm run lint:docs` |

The project keeps the linter in `scripts/vendor/`. See [D-009](04-decisions.md). The manifest has a
test. See [D-010](04-decisions.md).

## Data

TBD. No statement about storage, format, or volume yet.

## Limits

TBD. No statement about latency, volume, or cost yet.

## Postponed items

TBD. Each postponed item gets an identifier and a reason in
[01-goals-nongoals.md](01-goals-nongoals.md).
