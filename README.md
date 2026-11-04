# memlens

memlens is the long-term memory of an agent: a log of curated notes with a tree of retellings
above them.

**Status:** specification phase. The scaffold builds and the tests pass. No part does work yet.

## Parts

| Part             | Function                              |
| ---------------- | ------------------------------------- |
| Headless library | Does the work. Has no user interface. |
| CLI frontend     | Gives access from a terminal.         |
| DSH plugin       | Gives access from DeepSeek Harness.   |

## Layout

| Path                                       | Package               | Role                                      |
| ------------------------------------------ | --------------------- | ----------------------------------------- |
| [packages/core](packages/core)             | `@memlens/core`       | The headless library.                     |
| [packages/cli](packages/cli)               | `@memlens/cli`        | The CLI frontend. Binary `memlens`.       |
| [packages/dsh-plugin](packages/dsh-plugin) | `@memlens/dsh-plugin` | The DSH plugin. Identifier `dsh-memlens`. |

## Documents

| File                                                             | Content                                   |
| ---------------------------------------------------------------- | ----------------------------------------- |
| [docs/spec/README.md](docs/spec/README.md)                       | Specification index and rules.            |
| [docs/spec/02-requirements.md](docs/spec/02-requirements.md)     | Requirements with identifiers and status. |
| [docs/spec/03-open-questions.md](docs/spec/03-open-questions.md) | Open questions that block work.           |
| [docs/statements.md](docs/statements.md)                         | Customer statements, word for word.       |
| [AGENTS.md](AGENTS.md)                                           | Work rules for agents.                    |

## Setup

```sh
mise install
pnpm install
prek install
```

The file [mise.toml](mise.toml) sets the tool version lines. `mise install` gives a version inside each
line, and `mise upgrade` moves to the newest patch.

## Commands

Run the commands in a shell that mise activates, or start each command with `mise exec --`.

| Command              | Action                                      |
| -------------------- | ------------------------------------------- |
| `pnpm install`       | Install the workspace.                      |
| `pnpm run build`     | Build the three packages.                   |
| `pnpm run typecheck` | Check the types.                            |
| `pnpm run test`      | Run the tests.                              |
| `pnpm run lint`      | Check the code and the format with biome.   |
| `pnpm run format`    | Write the biome fixes and the format.       |
| `pnpm run lint:docs` | Check the documents against the STE limits. |
| `pnpm run verify`    | Run the build and all checks.               |

## Languages

| Item                 | Language                                                                                |
| -------------------- | --------------------------------------------------------------------------------------- |
| Documents            | Simplified Technical English, ASD-STE100.                                               |
| Code comments        | Simplified Technical English, ASD-STE100.                                               |
| README               | English, Russian ([README.ru.md](README.ru.md)), Chinese ([README.zh.md](README.zh.md)) |
| Product localization | Russian and Chinese.                                                                    |

## Next step

The shape of a scope, the map of directions, and the snapshot fields are open.
See [Q-009](docs/spec/03-open-questions.md#q-009) and the questions after it.
