# Glossary

One term has one meaning in all documents and in all code. This file is also the terminology base
for ASD-STE100 rule 1.8. The project approves each technical noun in this table.

| Term             | Meaning                                                                                                                       | Source                                       |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| memlens          | The project in this repository: a headless library, a CLI frontend, and a DSH plugin.                                         | S-002                                        |
| statement        | A customer sentence in the chat, recorded word for word with an identifier `S-nnn`.                                           | D-002                                        |
| requirement      | A testable sentence about the behavior of the system, with an identifier `REQ-nnn`.                                           | [README.md](README.md)                       |
| constraint       | A limit that comes from the customer or from the environment, with an identifier `C-nnn`.                                     | [01-goals-nongoals.md](01-goals-nongoals.md) |
| non-goal         | An item that the project does not do, with an identifier `NG-nnn`.                                                            | [01-goals-nongoals.md](01-goals-nongoals.md) |
| open question    | An item without an answer, with an identifier `Q-nnn`.                                                                        | [03-open-questions.md](03-open-questions.md) |
| decision         | A selected option with a record of the alternatives, with an identifier `D-nnn`.                                              | [04-decisions.md](04-decisions.md)           |
| journal          | The file [../statements.md](../statements.md). It keeps the customer words.                                                   | D-002                                        |
| headless         | Without a user interface. Other programs start the function.                                                                  | S-002                                        |
| library          | The package with the main function. It has no terminal interface and no plugin interface.                                     | REQ-001                                      |
| frontend         | The part that gives access to the library for a user or for a program. The project has a CLI frontend and a plugin frontend.  | S-002                                        |
| CLI              | Command line interface. The user starts the function from a terminal.                                                         | S-002                                        |
| harness          | DeepSeek Harness (DSH), the agent harness that loads the plugin.                                                              | S-002                                        |
| plugin           | The package that the harness loads. The plugin gives access to the library from the harness.                                  | REQ-003                                      |
| bundle           | The installable set of plugin rows for the harness. This package has one row.                                                 | D-007                                        |
| bundle patch     | The file `cordis.patch.yml`. It adds the plugin row to the harness configuration.                                             | D-007                                        |
| row              | One plugin entry in the harness configuration. A row has an identifier and a module name.                                     | D-007                                        |
| workspace        | The pnpm unit that holds the packages of this repository.                                                                     | D-005                                        |
| localization     | The translation of the product text for one language. The scope of the term is open.                                          | Q-004                                        |
| STE              | ASD-STE100 Simplified Technical English, the writing standard of this project.                                                | S-003                                        |
| TBD              | To be determined. The item has no value yet. The item is not a requirement.                                                   | —                                            |
| GRACE-lite       | The project standard for code markup: one module contract for each file and one region for each public or non-trivial entity. | S-011                                        |
| LDD              | Log driven development. The code writes short debug messages with key-value data. The messages act as observable contracts.   | S-011                                        |
| native compiler  | TypeScript 7. The binary is `tsc`. The preview name was `tsgo`.                                                               | D-011                                        |
| note             | One curated fact in the log. It has a `body` and a `longform` document.                                                       | S-013                                        |
| body             | The short text of a note. It becomes a leaf of the tree. The target size is 384 bytes.                                        | S-013                                        |
| longform         | The full document of a note. The size limit is 16 KiB. It does not enter the tree.                                            | S-013                                        |
| retelling        | A short text that covers the notes below a node. The tree is a set of retellings.                                             | S-013                                        |
| tree             | The set of retellings above the notes. It is a cache, not a source of truth.                                                  | S-013                                        |
| direction        | One line of the map that tells the agent where the detail is.                                                                 | S-013                                        |
| directions block | The one `<directions>` block of the slice. It holds the registry and the catalog.                                             | S-013                                        |
| registry         | The part of the directions block that comes from the notes of the profile.                                                    | S-013                                        |
| catalog          | The level above the notes: a log of cards, with its own tree. It belongs to one profile.                                      | S-013                                        |
| card             | One catalog entry in the form `[scope] state`.                                                                                | S-013                                        |
| scope            | The unit of visibility and of write permission for the notes.                                                                 | S-013                                        |
| profile          | The unit that ties a set of scopes to one configuration and one preset.                                                       | S-013                                        |
| preset           | The second entry point of the plugin. It gives the configuration for an agent preset.                                         | S-013                                        |
| slice            | The text that the agent gets: one map of directions.                                                                          | S-013                                        |
| snapshot         | The materialized slice, with an `id` and a `scopes` field.                                                                    | S-013                                        |
| store            | The memory storage. It has a version, one of two backends, and one index port.                                                | S-013                                        |
| hide             | A mark that removes a note from the view. The agent can hide.                                                                 | S-013                                        |
| redact           | A mark that removes the content of a note for good. Only the CLI or the GUI can redact.                                       | S-013                                        |
| amend            | A change to the content of a note. Only the CLI or the GUI can amend.                                                         | S-013                                        |
| proposed         | The state of a note that an agent wrote into a scope without write permission, or wrote as a subagent.                        | S-013                                        |
| nudge            | The reminder that the harness gives the agent to write a note. The settings are open.                                         | S-013                                        |
| writer           | The background task that makes the retellings in batches.                                                                     | S-013                                        |
| review           | The check of a note by a human. It uses `review_at` and `reviewed_at` and stays out of the slice.                             | S-013                                        |
| index port       | The interface for the search. The implementation uses FTS5.                                                                   | S-013                                        |
| «Линза»          | The human name of the product. The idea of the name is the zoom: look through one layer into the depth.                       | S-013                                        |
| frontier         | The newest level of the tree. It holds the detail, and the older levels hold the short form.                                  | S-014                                        |
| level            | One row of the tree. A level has a fixed width, and one level covers 2^k leaves.                                              | S-014                                        |
| pair             | Two nodes that a retelling joins. The writer takes the most overdue pair first.                                               | S-014                                        |
| ruler            | The size measure of a retelling. The writer retries when the line does not become shorter.                                    | S-014                                        |
| shrink check     | The rule that a retelling must be shorter than its source.                                                                    | S-014                                        |
| compactor        | The background task that makes the retellings in batches. The glossary uses this word for the writer.                         | S-014                                        |
| trunk            | The merged state of a profile, above its branches.                                                                            | S-014                                        |
| branch           | The state of one session or one machine of a profile. A branch merges into the trunk at close and at idle.                    | S-014                                        |
| freeze           | The rule that the slice of a session stays the same for the whole session.                                                    | S-014                                        |
| sourceId         | The identifier of the source record of an import. A second import of one source adds no record.                               | S-014                                        |
| supersede        | The rule that a newer note can replace an older note in the view.                                                             | S-014                                        |
