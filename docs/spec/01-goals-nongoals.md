# Goals and non-goals

## Goals

| ID    | Goal                                                                                           | Priority | Source |
| ----- | ---------------------------------------------------------------------------------------------- | -------- | ------ |
| G-001 | The memory survives a session and a harness change.                                            | high     | S-013  |
| G-002 | At start the agent gets a map of directions: fresh items in detail, old items in a short form. | high     | S-013  |
| G-003 | The agent gets any fact word for word by its address.                                          | high     | S-013  |
| G-004 | One note costs one model call for its whole life.                                              | high     | S-013  |
| G-005 | A read costs no model call.                                                                    | high     | S-013  |

## Non-goals

Explicitly excluded items. A non-goal must not become a hidden requirement.

| ID     | Non-goal                                                | Reason                                                    | Source |
| ------ | ------------------------------------------------------- | --------------------------------------------------------- | ------ |
| NG-001 | A replacement for compaction.                           | Compaction stays. The memory holds facts across sessions. | S-013  |
| NG-002 | An "infinite chat".                                     | The memory is a log of notes, not a transcript.           | S-013  |
| NG-003 | A vector search and embeddings.                         | The search is lexical: FTS5.                              | S-013  |
| NG-004 | An entity graph and bitemporality of the Zep level.     | Out of scope for the first version.                       | S-013  |
| NG-005 | A live synchronization between machines.                | Export and import give the transfer.                      | S-013  |
| NG-006 | A blocking stop on a note debt.                         | The agent works without a stop. A stop costs a turn.      | S-014  |
| NG-007 | Memory maintenance inside the agent loop.               | The writer works in the background.                       | S-014  |
| NG-008 | A regular expression search.                            | The search is FTS5.                                       | S-014  |
| NG-009 | Each chat message as a leaf of the tree.                | A note is a curated fact, not a message.                  | S-014  |
| NG-010 | An unbounded view of the whole chat inside the context. | The slice has a limit on purpose.                         | S-014  |

## Constraints

Given from the outside. These items are not open for discussion and they limit the decisions.

| ID    | Constraint                                                                                              | Source |
| ----- | ------------------------------------------------------------------------------------------------------- | ------ |
| C-002 | Documents and code comments use ASD-STE100 Simplified Technical English.                                | S-003  |
| C-003 | The README has the eight languages of the DSH set.                                            | S-003, S-088 |
| C-004 | The specification is a set of markdown files in this repository.                                        | S-004  |
| C-005 | The stack is TypeScript on Node.js with pnpm workspaces.                                                | S-005  |
| C-006 | The project tools come from `mise.toml`.                                                                | S-007  |
| C-007 | A project check uses a file in this repository only.                                                    | S-009  |
| C-008 | The compiler is TypeScript 7 or newer.                                                                  | S-011  |
| C-009 | New code uses the GRACE-lite markup and log driven development.                                         | S-011  |
| C-010 | The linter is biome, the test runner is vitest, and the bundler is esbuild.                             | S-011  |
| C-011 | No document refers to a `§` section. No identifier refers to an item that the project does not contain. | S-011  |
| C-012 | Client code and backend code stay in separate modules where the split applies.                          | S-011  |
| C-013 | The library does not know the CLI, the plugin, or the user interface.                                   | S-011  |
