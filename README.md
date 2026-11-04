# memlens

memlens is a headless library with a CLI frontend and a DSH plugin.

**Status:** specification phase. The scaffold builds and the tests pass. No part does work yet.

## Parts

| Part | Function |
|---|---|
| Headless library | Does the work. Has no user interface. |
| CLI frontend | Gives access from a terminal. |
| DSH plugin | Gives access from DeepSeek Harness. |

## Layout

| Path | Package | Role |
|---|---|---|
| [packages/core](packages/core) | `@memlens/core` | The headless library. |
| [packages/cli](packages/cli) | `@memlens/cli` | The CLI frontend. Binary `memlens`. |
| [packages/dsh-plugin](packages/dsh-plugin) | `@memlens/dsh-plugin` | The DSH plugin. Identifier `dsh-memlens`. |

## Documents

| File | Content |
|---|---|
| [docs/spec/README.md](docs/spec/README.md) | Specification index and rules. |
| [docs/spec/02-requirements.md](docs/spec/02-requirements.md) | Requirements with identifiers and status. |
| [docs/spec/03-open-questions.md](docs/spec/03-open-questions.md) | Open questions that block work. |
| [docs/statements.md](docs/statements.md) | Customer statements, word for word. |
| [AGENTS.md](AGENTS.md) | Work rules for agents. |

## Commands

| Command | Action |
|---|---|
| `pnpm install` | Install the workspace. |
| `pnpm run build` | Build the three packages. |
| `pnpm run typecheck` | Check the types. |
| `pnpm run test` | Run the tests. |
| `pnpm run plugin:check` | Check the plugin manifest. |
| `pnpm run lint:docs` | Check the documents against the STE limits. |

## Languages

| Item | Language |
|---|---|
| Documents | Simplified Technical English, ASD-STE100. |
| Code comments | Simplified Technical English, ASD-STE100. |
| README | English, Russian ([README.ru.md](README.ru.md)), Chinese ([README.zh.md](README.zh.md)) |
| Product localization | Russian and Chinese. |

## Next step

The product function is open. See [Q-002](docs/spec/03-open-questions.md#q-002).
