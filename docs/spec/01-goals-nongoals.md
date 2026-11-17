# Goals and non-goals

## Goals

| ID    | Goal                                                                                           | Priority |
| ----- | ---------------------------------------------------------------------------------------------- | -------- |
| G-001 | The memory survives a session and a harness change.                                            | high     |
| G-002 | At start the agent gets a map of directions: fresh items in detail, old items in a short form. | high     |
| G-003 | The agent gets any fact word for word by its address.                                          | high     |
| G-004 | One note costs one model call for its whole life.                                              | high     |
| G-005 | A read costs no model call.                                                                    | high     |

## Non-goals

Explicitly excluded items. A non-goal must not become a hidden requirement.

| ID    | Non-goal                                                                                       | Reason   |
| ------ | ------------------------------------------------------- | --------------------------------------------------------- |
| NG-001 | A replacement for compaction.                           | Compaction stays. The memory holds facts across sessions. |
| NG-002 | An "infinite chat".                                     | The memory is a set of notes, not a transcript.           |
| NG-003 | A vector search and embeddings.                         | The search is lexical: FTS5.                              |
| NG-004 | An entity graph and bitemporality of the Zep level.     | Out of scope for the first version.                       |
| NG-005 | A live synchronization between machines.                | Export and import give the transfer.                      |
| NG-006 | A blocking stop on a note debt.                         | The agent works without a stop. A stop costs a turn.      |
| NG-007 | Memory maintenance inside the agent loop.               | The compaction works in the background.                   |
| NG-008 | A regular expression search.                            | The search is FTS5.                                       |
| NG-009 | Each chat message as a leaf of the tree.                | A note is a curated fact, not a message.                  |
| NG-010 | An unbounded view of the whole chat inside the context. | The slice has a limit on purpose.                         |

## Constraints

Given from the outside. These items are not open for discussion and they limit the decisions.

| ID    | Constraint                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------- |
| C-002 | Documents and code comments use ASD-STE100 Simplified Technical English.                                |
| C-003 | The README has the eight languages of the DSH set.                                            |
| C-004 | The specification is a set of markdown files in this repository.                                        |
| C-005 | The stack is TypeScript on Node.js with pnpm workspaces.                                                |
| C-006 | The project tools come from `mise.toml`.                                                                |
| C-007 | A project check uses a file in this repository only.                                                    |
| C-008 | The compiler is TypeScript 7 or newer.                                                                  |
| C-009 | New code uses the GRACE-lite markup and log driven development.                                         |
| C-010 | The linter is biome, the test runner is vitest, and the bundler is esbuild.                             |
| C-011 | No document refers to a `§` section. No identifier refers to an item that the project does not contain. |
| C-012 | Client code and backend code stay in separate modules where the split applies.                          |
| C-013 | The library does not know the CLI, the plugin, or the user interface.                                   |
