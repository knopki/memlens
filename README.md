# memlens

memlens is the long-term memory of an agent. It keeps curated notes across sessions and folds them
into a tree of summaries. The agent gets a small map at the start of each session.

**Status:** specification phase. The scaffold builds and the tests pass. No part does work yet.

## The problem

An agent forgets between sessions. A new session starts without the facts of the old sessions. A long
chat is not the answer: each token costs, and the model still loses the old facts.

## The idea

The memory is a log of curated notes, not a chat history. A note holds one fact in a short `body` and
an optional `longform` document.

The store folds the notes into a tree. A background writer merges two adjacent notes into one line,
then two lines into one, and so on. A line stands in for its notes for weeks or years, and the agent
opens it back into the two lines below.

The catalog is a second tree above the scopes. Its leaves are the scope lines, so the agent sees each
scope of the profile in one line.

The slice is the text in the agent context. It holds the policy, the `directions` block with one line
for each scope, and the `here` block with the frontier of the active scope.

```text
the log of events
      │
      ▼
 the records ──► the tree of a scope ──► the catalog ──► the slice ──► the agent
      ▲                                                    │
      └────────────────── memory_note ◄────────────────────┘
```

## The objects

| Object  | Role                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------- |
| Event   | One immutable record of the log. The ops are `note`, `amend`, `hide`, `redact`, `review`, `dismiss`, and `node`. |
| Record  | One note after the projection. It holds the copied fields, the state, and the position `pos`.       |
| Node    | One line that stands in for a range of notes. A node is a `node` event.                             |
| Scope   | A key of the form `kind:name`, for example `project:dsh/memlens`. A record names its scope.         |
| Profile | The set of scopes, the budgets, and the settings of one agent group.                                |
| Slice   | The text in the agent context.                                                                      |

## A session

1. The harness starts a session. The plugin renders the slice from the store and puts the text in the agent context.
2. The agent reads the map. The `directions` block gives one line for each scope, and the `here` block gives the frontier of the active scope.
3. The agent opens a line that it needs. The store gives the note word for word, or the two lines below a summary.
4. The agent writes a note. The log grows, and the tree of the scope becomes dirty.
5. The writer merges the dirty nodes in the background. A compaction or an idle time renders a new slice.

A read costs no model call. A note costs one model call in its life, at the merge of its tree.

## The tools

| Tool            | Action                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| `memory_find`   | Search by words, with a limit by date, kind, or scope.                    |
| `memory_open`   | Open a note by its address, or a summary into the two lines below it.     |
| `memory_note`   | Save one note.                                                            |
| `memory_forget` | Hide a note.                                                              |
| `memory_review` | Give the notes that are due for review.                                   |
| `memory_scope`  | List the scopes.                                                          |

A subagent writes proposals. A proposal is a write with the field `proposed`, and the projection
ignores it. A human or the parent agent writes the real change.

## Why this shape

- The log is the only truth. An import, a rebuild, and a redaction give one answer for any order of arrival.
- The tree gives a bounded view with a cheap read. The agent sees a map, and it opens what it needs.
- A note costs one model call in its life, because the tree merges once.
- The agent curates the notes, so the tree holds facts and decisions, not messages.
- The index is a cache. A lost index comes back from the log.

## What it is not

A replacement for compaction, an infinite chat, a vector search, an entity graph, or a live
synchronization between machines. See [01-goals-nongoals.md](docs/spec/01-goals-nongoals.md).

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
| [docs/spec/00-overview.md](docs/spec/00-overview.md)             | The product boundary.                     |
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
| README files         | The eight languages of the DSH set. The repository has English, Russian ([README.ru.md](README.ru.md)), and Chinese ([README.zh.md](README.zh.md)) now. |
| Product localization | The eight languages of the DSH set.                                                     |

## Next step

The specification is in the review for acceptance. The customer accepted slices 1 to 8, and slices 9 to
17 wait. The policy text of the slice is a working copy, and the research of the prior art can change it.
