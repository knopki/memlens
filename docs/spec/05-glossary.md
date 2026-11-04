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
| note             | One curated fact in the log. The `note` event records it with a `body` and a `longform`.                                      | S-013, S-016                                 |
| body             | The short text of a note. It becomes a leaf of the tree. The target size is 384 bytes.                                        | S-013                                        |
| longform         | The full document of a note. The size limit is 16 KiB. It does not enter the tree.                                            | S-013                                        |
| retelling        | A short text that covers the notes below a node. The tree is a set of retellings.                                             | S-013                                        |
| tree             | The set of retellings above the notes. It is a cache, not a source of truth.                                                  | S-013                                        |
| direction        | One line of the map: the address of a node or of a record, the range of dates, and the text.                                  | S-013, S-029                                 |
| directions block | The one `<directions>` block of the slice. It holds the registry and the catalog.                                             | S-013                                        |
| registry         | The part of the directions block that comes from the notes of the profile.                                                    | S-013                                        |
| catalog          | The level above the notes: a log of cards, with its own tree. It belongs to one profile.                                      | S-013                                        |
| card             | The catalog entry in the form `[scope] state`. A `note` event with `kind: "card"` records it, and it holds no review field.   | S-013, S-016                                 |
| scope            | The unit of visibility and of write permission. A scope is a key in the events, and the store holds no record for it.         | S-013, S-033                                 |
| profile          | The unit that ties a set of scopes to one configuration section and one preset.                                               | S-013, S-036                                 |
| preset           | The second entry point of the plugin. It gives the configuration for an agent preset.                                         | S-013                                        |
| slice            | The text that the agent gets: one map of directions.                                                                          | S-013                                        |
| snapshot         | One materialized slice in the store of memlens. The store keeps one for each session.                                         | S-013, S-044                                 |
| store            | The memory storage. It has a version, one of two backends, and one index port.                                                | S-013                                        |
| hide             | The op that removes a note from the view. The agent can hide a note.                                                          | S-013, S-016                                 |
| redact           | The op that removes the content of a note for good. Only the CLI or the GUI can redact.                                       | S-013, S-016                                 |
| amend            | The op that changes the content or the scope of a note. Only the CLI or the GUI can amend.                                    | S-013, S-034                                 |
| proposed         | The state of a note that waits for a human decision. A subagent write and a write outside the profile give it.                | S-013, S-039                                 |
| nudge            | The reminder that the harness gives the agent to write a note. The settings are open.                                         | S-013                                        |
| writer           | The background task that makes the retellings in batches.                                                                     | S-013                                        |
| review           | The check of a note by a human. The `review` event records it, and `review_at` gives the date of the next check.              | S-013, S-016                                 |
| index port       | The interface for the search. The implementation uses FTS5.                                                                   | S-013                                        |
| «Линза»          | The human name of the product. The idea of the name is the zoom: look through one layer into the depth.                       | S-013                                        |
| frontier         | The newest level of the tree. It holds the detail, and the older levels hold the short form.                                  | S-014                                        |
| level            | One row of the tree. A level has a fixed width, and one level covers 2^k leaves.                                              | S-014                                        |
| pair             | Two children that the node above joins.                                                                                       | S-014, S-030                                 |
| ruler            | The size measure of a retelling. The writer retries when the line does not become shorter.                                    | S-014                                        |
| shrink check     | The rule that a retelling must be shorter than its source.                                                                    | S-014                                        |
| compactor        | The background task that makes the retellings in batches. The glossary uses this word for the writer.                         | S-014                                        |
| trunk            | The merged state of a profile, above its branches.                                                                            | S-014                                        |
| branch           | The state of one session or one machine of a profile. A branch merges into the trunk at close and at idle.                    | S-014                                        |
| freeze           | The rule that the slice of a session stays the same for the whole session.                                                    | S-014                                        |
| supersede        | A newer note replaces an older note in the view. It applies one time, at the first `live` state, and in one scope.            | S-014, S-016                                 |
| event            | One immutable fact in the log. It has `id`, `at`, `op`, and `scope`, and a payload for the op.                                | S-016                                        |
| op               | The field of an event that names the change: `note`, `amend`, `hide`, `redact`, `review`, `accept`, or `dismiss`.             | S-016                                        |
| payload          | The fields of an event that belong to the op.                                                                                 | S-016                                        |
| ULID             | The identifier format of an event. It is unique and it sorts by time.                                                         | S-016                                        |
| pos              | The ordinal of the creating event in the log of one store. It is not a field of the event.                                    | S-016                                        |
| target           | The field of an op that names the note for a change.                                                                          | S-016                                        |
| kind             | The class of a note: `decision`, `preference`, `fact`, `task`, `note`, or `card`.                                             | S-016                                        |
| `live`           | The state of a note after an `accept` event.                                                                                  | S-016                                        |
| `deleted`        | The state of a note after a `dismiss` event.                                                                                  | S-016                                        |
| sanitized form   | The form of a redacted event. It keeps the `id` and has `redacted: true`, an empty `body`, and a null `longform`.             | S-016                                        |
| at               | The time of an event in the log.                                                                                              | S-017                                        |
| ts               | The time of the write of a note.                                                                                              | S-017                                        |
| idem             | The idempotency key of a write and of an import. A second record with one value adds nothing.                                 | S-018                                        |
| projection       | The build of the record set from the log, in two passes.                                                                      | S-020                                        |
| record           | The state of one note after the projection: the copied fields, `recorded_at`, and the flags.                                  | S-020                                        |
| state            | The lifecycle value of a record, in the order `live`, `hidden`, `proposed`, `deleted`. Only an `accept` lowers it.            | S-020, S-021                                 |
| hidden           | The state of a record after a `hide` event. The content stays.                                                                | S-020                                        |
| recorded_at      | The time of the note event in the log. It is equal to `at`.                                                                   | S-020                                        |
| content_cleared  | The flag of a redacted record. An `amend` event changes no content of this record, and it still changes the scope.            | S-020, S-035                                 |
| superseded_by    | The field of a record that names the note that superseded it.                                                                 | S-020                                        |
| pass             | One walk over the ordered events in the projection.                                                                           | S-020                                        |
| catalog scope    | The scope `__catalog__:<profile>`. It holds the cards of one profile.                                                         | S-023                                        |
| for_scope        | The field of a card that names the scope that the card describes.                                                             | S-023                                        |
| for_sources      | The field of a card that lists the ids of the records that the card covers.                                                   | S-023                                        |
| dirty            | The mark of a card that needs a rebuild after a change of a source.                                                           | S-023                                        |
| [redacted]       | The placeholder of the console and the view for a sanitized record. An event holds no such text.                              | S-023                                        |
| node             | One summary of the tree. It covers `2^level` positions for a level of 1 or more.                                              | S-025                                        |
| position         | One `pos` value in the geometry of the tree. A position with no live record is empty.                                         | S-025                                        |
| summary          | The text of one node. The target size is 512 bytes and the limit is 640 bytes.                                                | S-025                                        |
| input_gen        | The version of the input that made the summary.                                                                               | S-025                                        |
| leaf             | One record at the bottom of the tree. The tree holds no node of level 0.                                                      | S-028                                        |
| child            | A node or a record below a node. A change of a child makes the parent dirty.                                                  | S-030                                        |
| budget           | The size limits of one profile in bytes: `here` and `directions`. The two are independent.                                    | S-036, S-037                                 |
| subagent mode    | The access of a subagent: `propose` writes and reports, `read` reads only, `off` has no tool and no slice.                    | S-036, S-037                                 |
| here             | The tree slice of the current project. The budget `here` limits this part.                                                    | S-037                                        |
| directions       | The tree slice of the catalog. The budget `directions` limits this part.                                                      | S-037                                        |
| view             | The tiling of the frontier that the agent reads. Its cache key is `epoch`.                                                    | S-040                                        |
| fold             | The pass that merges built pairs until the view fits under `high`. It builds no node.                                         | S-040, S-041                                 |
| tile             | One block of the view. A tile is a node or a record.                                                                          | S-040                                        |
| due              | The priority of a pair: `(total - (start + 2^(level+1) - 1)) / 2^level`. The fold and the rebuild use it.                     | S-040, S-041                                 |
| epoch            | The cache key of the view: a hash of `storeRev` and the built nodes.                                                          | S-040                                        |
| storeRev         | The version of the store content. A counter in SQLite and a fingerprint in JSONL.                                             | S-040                                        |
| fresh            | The state of a node whose `input_gen` matches the input.                                                                      | S-040                                        |
| cacheTtl         | The idle time after which a new snapshot replaces the text. `deepseek/*` gives 2 hours.                                       | S-042                                        |
| how-to           | The static policy block of the slice.                                                                                         | S-042                                        |
| reason           | The cause of a snapshot: `session-start`, `ttl`, `compaction`, or `redact`.                                                   | S-042                                        |
