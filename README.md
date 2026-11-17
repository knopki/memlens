# memlens

memlens is the long-term memory of an agent. It keeps curated notes across sessions and folds them
into a tree of summaries. The agent gets a small map at the start of each session.

**Status:** the core library and the CLI are in the code. The standalone console uses the store. The plugin implements configuration and registration. Its memory context and tools, and the session import, are pending.

## The problem

An agent forgets between sessions. A new session starts without the facts of the old sessions. A long
chat is not the answer: each token costs, and the model still loses the old facts.

## The idea

The memory holds current note rows in one SQLite database. It is not a chat history. A note holds one
fact in a short `body` and an optional `longform` document.

The store folds the notes into a tree. A background compaction merges two adjacent notes into one line,
then two lines into one, and so on. A line stands in for its notes for weeks or years, and the agent
opens it back into the two lines below.

The directions list gives the scopes of the profile, so the agent sees each scope in one line. The
store derives the list from the note rows, and no second tree exists.

The slice is the text in the agent context. It holds the policy, the `directions` block with one line
for each scope, and the `here` block with the frontier of the active scope.

```text
 the note rows
      │
      ▼
 the tree of a scope ──► the directions list ──► the slice ──► the agent
      ▲                                               │
      └─────────────── memory_note ◄──────────────────┘
```

## The objects

| Object   | Role                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------- |
| Note row | One stored note: the body, the kind, the scope, the state, and the times.                             |
| Slot     | The rank of the `(ts, id)` key inside the scope. The slot gives the address of the note.              |
| Node row | One summary of an aligned range of slots. It is a cache, and the store rebuilds it from the notes.    |
| Scope    | A key of the form `kind:name`, for example `project:dsh/memlens`. A note row names its scope.         |
| Profile  | The set of scopes, the budgets, and the settings of one agent group.                                  |
| Slice    | The text in the agent context.                                                                        |

## A session

1. The harness starts a session. The plugin renders the slice from the store and puts the text in the agent context.
2. The agent reads the map. The `directions` block gives one line for each scope, and the `here` block gives the frontier of the active scope.
3. The agent opens a line that it needs. The store gives the note word for word, or the two lines below a summary.
4. The agent writes a note. The store gains one row, and the ranges over its slot become dirty.
5. The compaction merges the dirty ranges. The command `memlens compact` starts a build, and a build renders a new slice.

A read costs no model call. A note costs one model call in its life, at the merge of its tree.

## The tools

| Tool            | Action                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| `memory_find`   | Search by words, with a limit by date, kind, or scope.                    |
| `memory_open`   | Open a note by its address, or a summary into the two lines below it.     |
| `memory_note`   | Save one note.                                                            |
| `memory_forget` | Hide a note.                                                              |
| `memory_review` | Give the notes that are due for review.                                   |
| `memory_map`    | List the scopes, or give the tree slice of one scope.                     |

A subagent writes proposals. A proposal is a local row with a payload and a thirty-day expiry. A human
or the parent agent applies the real change.

## Why this shape

- The note rows are the only truth. An import, a rebuild, and a redaction give one answer for any order of arrival.
- The tree gives a bounded view with a cheap read. The agent sees a map, and it opens what it needs.
- A note costs one model call in its life, because the tree merges once.
- The agent curates the notes, so the tree holds facts and decisions, not messages.
- The index is a cache. The command `repair` rebuilds it from the rows.

## What it is not

A replacement for compaction, an infinite chat, a vector search, an entity graph, or a live
synchronization between machines. The search stays lexical (FTS5), and a note is a curated fact,
not a chat message.

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
| [packages/ui](packages/ui)                 | `@memlens/ui`         | The browser client of the console.        |
| [packages/dsh-plugin](packages/dsh-plugin) | `@memlens/dsh-plugin` | The DSH plugin. Identifier `dsh-memlens`. |

## Documents

| File                                             | Content                                |
| ------------------------------------------------- | -------------------------------------- |
| [docs/architecture.md](docs/architecture.md)      | How the system works.                  |
| [docs/configuration.md](docs/configuration.md)   | The configuration format and examples.  |
| [docs/arch/README.md](docs/arch/README.md)       | The architecture model as diagrams.     |
| [docs/features](docs/features/README.md)         | Cross-module behavior as scenarios.     |
| [docs/questions.md](docs/questions.md)           | Open questions that block decisions.    |
| [AGENTS.md](AGENTS.md)                           | Work rules for agents.                 |

## Configuration

memlens works with no configuration file. To change a value, copy the parts that you want into
`~/.config/memlens/config.toml`:

```toml
defaultProfile = "default"

[profile.default]
scopes = ["*"]

[profile.default.budget]
here = 20
directions = 10
```

The DSH plugin reads the same file and adds two layers of its own. See each key, default, and
example in [docs/configuration.md](docs/configuration.md).

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
| `pnpm run build`     | Build the four packages.                    |
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
| README files         | The eight languages of the DSH set. The repository has English, Russian ([README.ru.md](README.ru.md)), and Chinese ([README.zh.md](README.zh.md)) now. |
| Product localization | The eight languages of the DSH set.                                                     |

## Next step

The core, the CLI, and the console are in the code. The plugin surface and the session import are
pending. See [06-architecture.md](docs/spec/06-architecture.md#remaining-work). The policy text of the
slice is a working copy.
