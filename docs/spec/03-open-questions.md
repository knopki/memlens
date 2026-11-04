# Open questions

A blocking question stops the current portion of the specification until the customer answers it.

| ID              | Question                                                                                                                                | Why it matters                                                                                                                                                                    | Blocks                                   | Owner    | Status |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------- | ------ |
| [Q-004](#q-004) | What does "localization" include: the product interface, the documents, or both?                                                        | This decision changes REQ-006 and the file set.                                                                                                                                   | REQ-006                                  | customer | open   |
| [Q-005](#q-005) | Which DSH version does the plugin support?                                                                                              | The plugin API changes between DSH releases.                                                                                                                                      | REQ-003                                  | customer | open   |
| [Q-006](#q-006) | Does the plugin use the library?                                                                                                        | If yes, the library has one public interface for two frontends. If no, the plugin repeats the work.                                                                               | [06-architecture.md](06-architecture.md) | customer | open   |
| [Q-007](#q-007) | Which license does the project use?                                                                                                     | npm publication and the plugin manifest need a license value.                                                                                                                     | Publishing                               | customer | open   |
| [Q-008](#q-008) | Does the plugin package need a README in five languages?                                                                                | The DSH guide recommends five for a published plugin. The project uses three.                                                                                                     | Publishing                               | customer | open   |
| [Q-010](#q-010) | What is the form of the map of directions, and what is its size limit?                                                                  | The slice goes into the system prompt, so its size is a cost.                                                                                                                     | REQ-017, REQ-020                         | customer | open   |
| [Q-012](#q-012) | Which keys and which default does the nudge have?                                                                                       | The agent behavior depends on the default.                                                                                                                                        | REQ-031                                  | customer | open   |
| [Q-013](#q-013) | What input and what output does `memory_review` have?                                                                                   | The tool is short on purpose, so its shape matters.                                                                                                                               | REQ-039                                  | customer | open   |
| [Q-014](#q-014) | Which surface does the session mode of the console use in the harness?                                                                  | The plugin contract depends on the slot.                                                                                                                                          | REQ-047                                  | customer | open   |
| [Q-015](#q-015) | Which operations does the index port have?                                                                                              | Two backends must satisfy one interface.                                                                                                                                          | REQ-041                                  | customer | open   |
| [Q-017](#q-017) | Who sets `review_at`, and what is the review queue?                                                                                     | The human workflow depends on it.                                                                                                                                                 | REQ-037                                  | customer | open   |
| [Q-019](#q-019) | What is the export and import format, and how does `redact` block a restore?                                                            | The transfer between machines uses it.                                                                                                                                            | REQ-025                                  | customer | open   |
| [Q-020](#q-020) | Which value wins in the merge of the main configuration and the preset?                                                                 | Two entry points share `scopes`, `budget`, and `subagents`.                                                                                                                       | REQ-029                                  | customer | open   |
| [Q-021](#q-021) | What is the retelling prompt of the tree?                                                                                               | The statements give the node geometry, the depth, and the size. The prompt stays open.                                                                                            | REQ-009, REQ-032                         | customer | open   |
| [Q-022](#q-022) | What is the form of the line about a subagent write in the parent report?                                                               | The parent must see the write, and the line costs tokens.                                                                                                                         | REQ-035                                  | customer | open   |
| [Q-023](#q-023) | Is `longform` available by address, in the slice, or in both?                                                                           | The size limit says what the tree does not hold.                                                                                                                                  | REQ-010, REQ-013                         | customer | open   |
| [Q-024](#q-024) | Does the console live in the CLI package or in its own package, and which stack does it use?                                            | C-012 splits client and backend code, and the console is client code.                                                                                                             | REQ-046                                  | customer | open   |
| [Q-026](#q-026) | Which retry limit and which length ratio does the writer use?                                                                           | OptChat gives five tries. elephant-memory took three tries, accepts a line up to 1.25 times the limit, and asks 0.75 of the limit on a retry. Our values must agree with the cap. | REQ-051                                  | customer | open   |
| [Q-027](#q-027) | Which rule moves the excess into `longform`: a cut at a word boundary, or the tail as it is? Does the tool make the move, or the model? | The rule decides what the tree keeps and what the document keeps.                                                                                                                 | REQ-011                                  | customer | open   |
| [Q-030](#q-030) | How does a merge join a sanitized event and a full event with one `id`?                                                                 | An import can bring the full event of a note that a local `redact` event cleared.                                                                                                 | REQ-078, REQ-082                         | customer | open   |
| [Q-055](#q-055) | Which fields does the rendered snapshot carry?                                                                                          | The store holds no record. Each field needs a home, or the record leaves the document.                                                                                            | REQ-182, REQ-183, REQ-184, REQ-185       | customer | open   |

## Details

### Q-005

The installed host is DeepSeek Harness 0.2.1-rc.5. The scaffold uses this version. A published plugin
needs a clear support range.

### Q-006

Assumption in this specification: the plugin uses the same library functions as the CLI. This
assumption is not a requirement. It stays an assumption until the customer agrees to it.

### Q-007

No license value in the manifests. The file set has no `LICENSE`.

### Q-008

The project rule is three languages. See [D-006](04-decisions.md). The DSH guide recommends five for
a published plugin.
### Q-030

The statement stops after the words "the merge rules". The model has no `scrub` step (S-024).

- Option A: a sanitized event wins over a full event with one `id`, in each order.
- Option B: the event with the later `at` wins, and the store keeps that content.

### Q-055

The store of memlens holds no snapshot (D-050). The session history of the harness holds the text
(D-052). The text travels alone, or the store keeps the fields in a record without the text.

- Option A: the text only. The session history holds it, and nothing else travels.
- Option B: the nine fields of S-042. The `id`, the `profile`, `parts`, `bytes`, and `reason` serve
  the console and the diagnosis.

## Closed questions

| ID    | Question                                                                | Answer                                                                                                                                   | Date       |
| ----- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Q-001 | Which stack and language does the project use?                          | TypeScript on Node.js with pnpm workspaces. See [D-005](04-decisions.md).                                                                | 2026-11-04 |
| Q-002 | What does the library do?                                               | The library is the memory engine: the log of notes, the tree of retellings, the catalog, and the slice. See S-013.                       | 2026-11-04 |
| Q-025 | Does the 512-byte cap hold, or does the system accept a tolerance?      | The declared size is 384 bytes and the real maximum is 512 bytes. Text above the limit moves into `longform`. See S-015.                 | 2026-11-04 |
| Q-003 | What are the package names, the binary name, and the plugin identifier? | `@memlens/core`, `@memlens/cli`, `@memlens/dsh-plugin`, binary `memlens`, plugin identifier `dsh-memlens`. See [D-005](04-decisions.md). | 2026-11-04 |
| Q-016 | Which event types does the log have, and which ids identify them?       | Seven ops. The `id` of an event is a ULID, and it is the identity. See S-016.                                                            | 2026-11-04 |
| Q-028 | Does the record of a note keep `reviewed_at`?                           | No. The record keeps `review_at` only, and the `review` event gives the date of the check. See S-017.                                    | 2026-11-04 |
| Q-032 | What does `ts` hold, and how does it differ from `at`?                  | `at` gives the time of the log, and `ts` gives the time of the write. See S-017.                                                         | 2026-11-04 |
| Q-029 | Does `target` name the `note` event, or the newest event of the note?   | The `note` event. The address of a note does not change after an amend. See S-018.                                                       | 2026-11-04 |
| Q-033 | Does `sourceId` stay the key of an import, or does `idem` replace it?   | `idem`. The prior-art table gives principles, not field names, and the model holds no `sourceId`. See S-018.                             | 2026-11-04 |
| Q-031 | Do all events carry `session`, `turn`, and `preset`, or the note only?  | The `note` event only. The agent gives the three fields when it calls the tool. See S-019.                                               | 2026-11-04 |
| Q-034 | Does a `hide` event on a proposed note remove it from the review queue? | No. The state stays `proposed` and the note leaves the view only. See S-021.                                                             | 2026-11-04 |
| Q-035 | Does `dismiss` apply to a note that is not proposed?                    | Each state. A live note becomes `deleted` after a `dismiss`. See S-021.                                                                  | 2026-11-04 |
| Q-036 | Does a hidden proposed record enter the view after an `accept`?         | Yes. The `accept` clears the effect of the earlier `hide` event. See S-022.                                                              | 2026-11-04 |
| Q-037 | Does `scrub` come back, or does the model keep no such step?            | No `scrub`. A `redact` event gives the sanitized form, and the store extends it to each card. See S-024.                                 | 2026-11-04 |
| Q-038 | Which required fields of a note does a card carry?                      | None of `review_at`, `proposed`, `turn`, and `preset`. A card is not reviewed and not proposed. See S-024.                               | 2026-11-04 |
| Q-039 | Do `ts_from`/`ts_to` hold the `ts` values, or the `at` values?          | The `ts` values, the time of the write. See S-026.                                                                                       | 2026-11-04 |
| Q-040 | Is a level 0 node a separate summary, or the record itself?             | The record itself. The tree holds no node of level 0. See S-028.                                                                         | 2026-11-04 |
| Q-042 | In which order does the frontier render the levels?                     | From the oldest to the newest: the coarse lines first. See S-029.                                                                        | 2026-11-04 |
| Q-043 | In which order does the writer take the dirty nodes?                    | The node with the oldest `built_at` first, and a node waits for its children. See S-031.                                                 | 2026-11-04 |
| Q-044 | Where does the description of a scope live?                             | Nowhere. The model holds no description field, and the first note gives the text. See S-033.                                             | 2026-11-04 |
| Q-045 | Does an alias join the records of the old key to the new key?           | No alias. A wrong key changes by an amend of the record. See S-033.                                                                      | 2026-11-04 |
| Q-046 | Does `amend` change the scope of a note, or does a new op do it?        | The optional `scope` field of `amend`. A record with `content_cleared` moves too. See S-034.                                             | 2026-11-04 |
| Q-009 | Where do the writable scopes of a profile come from?                    | Each scope of the profile is writable. No read-only set. See S-038.                                                                      | 2026-11-04 |
| Q-049 | What does a write do in a scope outside the profile?                    | The note becomes `proposed` and waits for a human. See S-039.                                                                            | 2026-11-04 |
| Q-050 | Which order does the fold take: `built_at` or `due`?                    | `due` only. The fold and the rebuild use one order. See S-041.                                                                           | 2026-11-04 |
| Q-051 | Where do `high` and `low` come from?                                    | `high` is the budget of the part, and `low` is its half. See S-041.                                                                      | 2026-11-04 |
| Q-052 | Does the fold build the parent, or does it wait for a built parent?     | The fold builds nothing. The writer builds each node. See S-041.                                                                         | 2026-11-04 |
| Q-053 | Does the store of memlens keep the text of a snapshot?                  | No. The plugin renders the text and the harness keeps the copy. See S-046.                                                               | 2026-11-04 |
| Q-054 | Does the store keep the history of snapshots?                           | No record at all. The store of memlens holds no snapshot. See S-046.                                                                     | 2026-11-04 |
| Q-056 | What gives one text at each assembly between the triggers?              | The last snapshot of the session history. The plugin gives that text again. See S-047.                                                   | 2026-11-04 |
| Q-057 | Does a `redact` reach the copy of the slice in the session history?     | No, and that stays. The model saw the text, and the log belongs to the harness. See S-047.                                               | 2026-11-04 |
| Q-011 | Which fields does a snapshot hold?                                      | `id`, `session`, `profile`, `reason`, `at`, `text`, `bytes`, `parts`, and `scopes`. See S-042.                                           | 2026-11-04 |
| Q-018 | Where does the model cache TTL come from?                               | `cacheTtl`: 2 hours for `deepseek/*`, 5 minutes for `anthropic/*`, 1 hour for another model. See S-042.                                  | 2026-11-04 |
| Q-047 | What does the `here` budget cover, and is `slice` the sum?              | The `slice` budget leaves. `here` limits the tree of the current project and `directions` the catalog tree. See S-037.                   | 2026-11-04 |
| Q-048 | What does each subagent mode allow?                                     | `propose` writes and reports, `read` reads only, `off` gives no tool and no slice. See S-037.                                            | 2026-11-04 |
| Q-041 | What makes a pair of nodes overdue?                                     | No measure. A node is dirty when a source changes, and the writer works on dirty nodes. See S-030.                                       | 2026-11-04 |
