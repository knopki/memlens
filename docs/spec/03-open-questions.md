# Open questions

A blocking question stops the current portion of the specification until the customer answers it.

| ID              | Question                                                                                                                                | Why it matters                                                                                                                                                                    | Blocks                                   | Owner    | Status |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------- | ------ |
| [Q-004](#q-004) | What does "localization" include: the product interface, the documents, or both?                                                        | This decision changes REQ-006 and the file set.                                                                                                                                   | REQ-006                                  | customer | open   |
| [Q-005](#q-005) | Which DSH version does the plugin support?                                                                                              | The plugin API changes between DSH releases.                                                                                                                                      | REQ-003                                  | customer | open   |
| [Q-006](#q-006) | Does the plugin use the library?                                                                                                        | If yes, the library has one public interface for two frontends. If no, the plugin repeats the work.                                                                               | [06-architecture.md](06-architecture.md) | customer | open   |
| [Q-007](#q-007) | Which license does the project use?                                                                                                     | npm publication and the plugin manifest need a license value.                                                                                                                     | Publishing                               | customer | open   |
| [Q-008](#q-008) | Does the plugin package need a README in five languages?                                                                                | The DSH guide recommends five for a published plugin. The project uses three.                                                                                                     | Publishing                               | customer | open   |
| [Q-009](#q-009) | What is a scope: which fields, and which state does it hold?                                                                            | The scope is the unit of visibility and of write permission. The store test needs the fields.                                                                                     | REQ-014, REQ-016, REQ-026                | customer | open   |
| [Q-010](#q-010) | What is the form of the map of directions, and what is its size limit?                                                                  | The slice goes into the system prompt, so its size is a cost.                                                                                                                     | REQ-017, REQ-020                         | customer | open   |
| [Q-011](#q-011) | Which fields does a snapshot hold? The statement gives `id` and `scopes`.                                                               | Storage and the merge need the full record.                                                                                                                                       | REQ-018                                  | customer | open   |
| [Q-012](#q-012) | Which keys and which default does the nudge have?                                                                                       | The agent behavior depends on the default.                                                                                                                                        | REQ-031                                  | customer | open   |
| [Q-013](#q-013) | What input and what output does `memory_review` have?                                                                                   | The tool is short on purpose, so its shape matters.                                                                                                                               | REQ-039                                  | customer | open   |
| [Q-014](#q-014) | Which surface does the session mode of the console use in the harness?                                                                  | The plugin contract depends on the slot.                                                                                                                                          | REQ-047                                  | customer | open   |
| [Q-015](#q-015) | Which operations does the index port have?                                                                                              | Two backends must satisfy one interface.                                                                                                                                          | REQ-041                                  | customer | open   |
| [Q-017](#q-017) | Who sets `review_at` and `reviewed_at`, and what is the review queue?                                                                   | The human workflow depends on it.                                                                                                                                                 | REQ-037                                  | customer | open   |
| [Q-018](#q-018) | Where does the model cache TTL come from?                                                                                               | The update rule uses the value.                                                                                                                                                   | REQ-021                                  | customer | open   |
| [Q-019](#q-019) | What is the export and import format, and how does `redact` block a restore?                                                            | The transfer between machines uses it.                                                                                                                                            | REQ-025                                  | customer | open   |
| [Q-020](#q-020) | Which keys does the preset configuration give, and which one wins in a merge?                                                           | Two entry points share one configuration.                                                                                                                                         | REQ-028, REQ-029                         | customer | open   |
| [Q-021](#q-021) | What are the branch rules of the tree: the number of children, the depth, and the retelling prompt?                                     | The tree is the cache of the memory, so its shape is the cost.                                                                                                                    | REQ-009, REQ-032                         | customer | open   |
| [Q-022](#q-022) | What is the form of the line about a subagent write in the parent report?                                                               | The parent must see the write, and the line costs tokens.                                                                                                                         | REQ-035                                  | customer | open   |
| [Q-023](#q-023) | Is `longform` available by address, in the slice, or in both?                                                                           | The size limit says what the tree does not hold.                                                                                                                                  | REQ-010, REQ-013                         | customer | open   |
| [Q-024](#q-024) | Does the console live in the CLI package or in its own package, and which stack does it use?                                            | C-012 splits client and backend code, and the console is client code.                                                                                                             | REQ-046                                  | customer | open   |
| [Q-026](#q-026) | Which retry limit and which length ratio does the writer use?                                                                           | OptChat gives five tries. elephant-memory took three tries, accepts a line up to 1.25 times the limit, and asks 0.75 of the limit on a retry. Our values must agree with the cap. | REQ-051                                  | customer | open   |
| [Q-027](#q-027) | Which rule moves the excess into `longform`: a cut at a word boundary, or the tail as it is? Does the tool make the move, or the model? | The rule decides what the tree keeps and what the document keeps.                                                                                                                 | REQ-011                                  | customer | open   |
| Q-028           | Does the record of a note keep `reviewed_at`?                                                                                           | S-013 gives the two fields `review_at` and `reviewed_at`. S-016 gives `review_at` only.                                                                                           | REQ-037                                  | customer | open   |
| Q-029           | Does `target` name the `note` event, or the newest event of the note?                                                                   | Each op with a target must find the note after an amend.                                                                                                                          | REQ-066 to REQ-071                       | customer | open   |
| Q-030           | Which op makes the sanitized form, and how does a merge join it to a full event?                                                        | S-016 names `scrub`, and the op table does not list it. The last sentence of the statement is incomplete.                                                                         | REQ-078                                  | customer | open   |
| Q-031           | Which events carry `session`, `turn`, `preset`, and `idem`?                                                                             | The example event gives these fields, and the payload table gives none. REQ-057 uses `sourceId`.                                                                                  | REQ-057, REQ-065                         | customer | open   |
| Q-032           | What does `ts` hold, and how does it differ from `at`?                                                                                  | The example gives two different values. The tree and the review need one time for each note.                                                                                      | REQ-064                                  | customer | open   |

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

### Q-028

S-013 gives two fields. S-016 gives one field and a `review` event.

- Option A: the note keeps `review_at` only, and the time of the `review` event gives the date.
- Option B: the note keeps `reviewed_at` too, and the `review` payload gets both dates.

### Q-029

Each op with a `target` must find the note after an `amend` event.

- Option A: `target` names the `note` event. The store follows the chain of events.
- Option B: `target` names the newest event of the note.

### Q-030

The statement names `scrub` and gives no op for it. The last sentence stops after "the merge rules".

- Option A: `scrub` is a separate op, and a sanitized event wins over a full event with one `id`.
- Option B: `redact` makes the form, and the merge keeps the sanitized form in each order.

### Q-031

The example event gives `session`, `turn`, `preset`, and `idem`. The payload table gives none of them.

- Option A: `idem` is the key of one write call, and `sourceId` stays the key of an import.
- Option B: `idem` replaces `sourceId`, and an import uses the event `id` only.

### Q-032

The example gives `at` with the offset `Z` and `ts` with the offset `+03:00`.

- Option A: `at` is the time of the event, and `ts` is the time of the source fact.
- Option B: `ts` is the time of the event in the local time zone, and the store derives it.

## Closed questions

| ID    | Question                                                                | Answer                                                                                                                                   | Date       |
| ----- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Q-001 | Which stack and language does the project use?                          | TypeScript on Node.js with pnpm workspaces. See [D-005](04-decisions.md).                                                                | 2026-11-04 |
| Q-002 | What does the library do?                                               | The library is the memory engine: the log of notes, the tree of retellings, the catalog, and the slice. See S-013.                       | 2026-11-04 |
| Q-025 | Does the 512-byte cap hold, or does the system accept a tolerance?      | The declared size is 384 bytes and the real maximum is 512 bytes. Text above the limit moves into `longform`. See S-015.                 | 2026-11-04 |
| Q-003 | What are the package names, the binary name, and the plugin identifier? | `@memlens/core`, `@memlens/cli`, `@memlens/dsh-plugin`, binary `memlens`, plugin identifier `dsh-memlens`. See [D-005](04-decisions.md). | 2026-11-04 |
| Q-016 | Which event types does the log have, and which ids identify them?       | Seven ops. The `id` of an event is a ULID, and it is the identity. See S-016.                                                            | 2026-11-04 |
