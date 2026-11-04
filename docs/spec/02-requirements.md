# Requirements

Type: `FR` is a function, `NFR` is a quality limit, `C` is an external constraint on the product.

Status: see [README.md](README.md#status-values).

| ID      | Requirement                                                                  | Type | Status | Source | Test method                                                                                    |
| ------- | ---------------------------------------------------------------------------- | ---- | ------ | ------ | ---------------------------------------------------------------------------------------------- |
| REQ-001 | memlens includes a headless library.                                         | FR   | draft  | S-002  | The repository has the library package. The package builds. The package has no user interface. |
| REQ-002 | memlens includes a CLI frontend.                                             | FR   | draft  | S-002  | A command in a terminal starts the library function.                                           |
| REQ-003 | memlens includes a DSH plugin.                                               | FR   | draft  | S-002  | The plugin installs in DeepSeek Harness. The plugin starts.                                    |
| REQ-004 | All documents and code comments use ASD-STE100 Simplified Technical English. | C    | draft  | S-003  | Each sentence obeys the limits in [../../AGENTS.md](../../AGENTS.md#language-rules).           |
| REQ-005 | The README has an English version, a Russian version, and a Chinese version. | FR   | draft  | S-003  | The repository has `README.md`, `README.ru.md`, and `README.zh.md` with the same content.      |
| REQ-006 | The product has localization for Russian and Chinese.                        | FR   | draft  | S-003  | TBD. The scope of "localization" is open. See [Q-004](03-open-questions.md#q-004).             |

## Rules for new requirements

- One requirement is one sentence. Do not put two different properties in one sentence.
- Write the behavior that the user can see. Do not write the mechanism, unless the customer
  gives the mechanism as a constraint.
- Write the test method before you set the status to `accepted`.
  | REQ-007 | The library imports no CLI package, plugin package, harness package, or user interface package. | NFR | draft | S-011 | The test `packages/core/tests/isolation.test.ts` reads each library source file and finds no such import. |
  | REQ-008 | The memory keeps a log of curated notes. | FR | draft | S-013 | A note stays in the store after a write, and a later session reads it. |
  | REQ-009 | The memory keeps a tree of retellings above the notes. | FR | draft | S-013 | The view shows one root node and the retellings below it. |
  | REQ-010 | A note has a `body` and a `longform` document. | FR | draft | S-013 | The store refuses a write without a body. The store accepts a write with a body and a longform. |
  | REQ-011 | The system accepts a `body` of 512 bytes maximum. The target size is 384 bytes. | FR | draft | S-013 | The store refuses a body of 513 bytes. The store accepts a body of 384 bytes. |
  | REQ-012 | A `longform` document is 16 KiB maximum. | FR | draft | S-013 | The store refuses a longform of 16 KiB and one byte. |
  | REQ-013 | A `longform` document does not enter the tree. | FR | draft | S-013 | No tree node holds longform text. |
  | REQ-014 | The memory has two levels on one engine: the notes are the leaves, and a catalog of cards is above them. | FR | draft | S-013 | The store keeps note records and catalog records, and one build path makes both trees. |
  | REQ-015 | A catalog card reads `[scope] state`. | FR | draft | S-013 | Each card follows the pattern. |
  | REQ-016 | The catalog belongs to one profile. A scope of another profile does not enter a shared catalog node. | FR | draft | S-013 | A catalog node of profile A lists no scope of profile B. |
  | REQ-017 | The registry and the catalog render in one `<directions>` block. | FR | draft | S-013 | The slice has one directions block with both parts. |
  | REQ-018 | The slice is a materialized snapshot with an `id` and a `scopes` field. | FR | draft | S-013 | Each update writes a new snapshot with its own id. |
  | REQ-019 | The `sessions` record holds the pointer to the current snapshot. | FR | draft | S-013 | A session reads its slice through the pointer. |
  | REQ-020 | The plugin gives the slice to the harness as `systemPrompt.context`. | FR | draft | S-013 | The system prompt of the turn contains the slice. |
  | REQ-021 | The slice updates at a new session, at a compaction, and after an idle time longer than the model cache TTL. | FR | draft | S-013 | TBD. The source of the TTL is open. See Q-018. |
  | REQ-022 | The tree is a cache. The view is a deterministic function of the notes, the built nodes, and the store version. | NFR | draft | S-013 | Two builds from the same inputs give the same view. |
  | REQ-023 | The agent can hide a note. | FR | draft | S-013 | The agent tool list has `hide`, and a hidden note leaves the view. |
  | REQ-024 | Only the CLI or the GUI can redact or amend a note. | FR | draft | S-013 | The agent tool list has no `redact` and no `amend`. |
  | REQ-025 | A redacted note stays redacted. An import does not give its content back. | FR | draft | S-013 | An import of a store with a redacted note does not restore the text. |
  | REQ-026 | The agent writes a note in a visible scope. In a scope without write permission the note becomes `proposed`. | FR | draft | S-013 | The record of a write to a scope without write permission has the state `proposed`. |
  | REQ-027 | A `proposed` note is a new note only. An agent cannot propose a change to an existing note. | FR | draft | S-013 | The store refuses a proposal that names an existing note. |
  | REQ-028 | The plugin package has two entry points: `.` and `./preset`. | FR | draft | S-013 | The manifest exports both paths, and the harness loads each one. |
  | REQ-029 | The configuration merges the main configuration and the preset configuration into one. | FR | draft | S-013 | A profile with both sources gets the merged values. |
  | REQ-030 | The main agent writes the notes. | FR | draft | S-013 | Only the main agent has the write tool. |
  | REQ-031 | The nudge is configurable. | FR | draft | S-013 | TBD. The keys and the default are open. See Q-012. |
  | REQ-032 | A background writer makes the retellings in batches. | FR | draft | S-013 | A batch of notes gets a retelling after the writer runs. |
  | REQ-033 | The writer task is pure, and any executor can run it. | NFR | draft | S-013 | The task gives one output for one input and needs no session state. |
  | REQ-034 | A subagent writes only new notes as `proposed`. | FR | draft | S-013 | A subagent write has the state `proposed` and names no existing note. |
  | REQ-035 | A line about the subagent write goes to the report of the parent. | FR | draft | S-013 | The next parent turn holds the line. |
  | REQ-036 | A subagent cannot hide a note and cannot review a note. | FR | draft | S-013 | The subagent tool list has no `hide` and no `memory_review`. |
  | REQ-037 | Review uses `review_at` and `reviewed_at`. | FR | draft | S-013 | Both fields exist on the record. |
  | REQ-038 | Review does not enter the slice. | FR | draft | S-013 | The snapshot text holds no review data. |
  | REQ-039 | The agent has one short tool `memory_review`. | FR | draft | S-013 | The tool is in the list, and its answer is short. |
  | REQ-040 | A merge is a union of events by id. The projection converges for any arrival order. | FR | draft | S-013 | A merge in both orders gives one view. |
  | REQ-041 | Search uses FTS5 through a separate index port. | FR | draft | S-013 | The store calls the port, and the port has one implementation for each backend. |
  | REQ-042 | The JSONL backend keeps its index in the sidecar file `index.db`. | FR | draft | S-013 | The file exists after an index build. |
  | REQ-043 | The store has two backends of equal rank: sqlite and jsonl. | FR | draft | S-013 | Each backend passes the same store test. |
  | REQ-044 | The configuration lives in `$XDG_CONFIG_HOME/memlens`. The data lives in `$XDG_DATA_HOME/memlens`. | FR | draft | S-013 | A default run writes these directories only. |
  | REQ-045 | `MEMLENS_STORE` gives another data path. | FR | draft | S-013 | With the variable set, the data goes to the given path. |
  | REQ-046 | `memlens ui` is a standalone console. | FR | draft | S-013 | The command starts outside the harness. |
  | REQ-047 | In the harness the console runs in a session mode on the same view models. | FR | draft | S-013 | TBD. The mount point is open. See Q-014. |
