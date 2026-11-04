# Open questions

A blocking question stops the current portion of the specification until the customer answers it.

| ID              | Question                                                                                                                                | Why it matters                                                                                                                                                                    | Blocks                                   | Owner    | Status |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------- | ------ |
| [Q-004](#q-004) | What does "localization" include: the product interface, the documents, or both?                                                        | This decision changes REQ-006 and the file set.                                                                                                                                   | REQ-006                                  | customer | open   |
| [Q-005](#q-005) | Which DSH version does the plugin support?                                                                                              | The plugin API changes between DSH releases.                                                                                                                                      | REQ-003                                  | customer | open   |
| [Q-006](#q-006) | Does the plugin use the library?                                                                                                        | If yes, the library has one public interface for two frontends. If no, the plugin repeats the work.                                                                               | [06-architecture.md](06-architecture.md) | customer | open   |
| [Q-007](#q-007) | Which license does the project use?                                                                                                     | npm publication and the plugin manifest need a license value.                                                                                                                     | Publishing                               | customer | open   |
| [Q-008](#q-008) | Does the plugin package need a README in five languages?                                                                                | The DSH guide recommends five for a published plugin. The project uses three.                                                                                                     | Publishing                               | customer | open   |
| [Q-014](#q-014) | Which surface does the session mode of the console use in the harness?                                                                  | The plugin contract depends on the slot.                                                                                                                                          | REQ-047                                  | customer | open   |
| [Q-015](#q-015) | Which operations does the index port have?                                                                                              | Two backends must satisfy one interface.                                                                                                                                          | REQ-041                                  | customer | open   |
| [Q-019](#q-019) | What is the export and import format, and how does `redact` block a restore?                                                            | The transfer between machines uses it.                                                                                                                                            | REQ-025                                  | customer | open   |
| [Q-021](#q-021) | What is the retelling prompt of the tree, and of the card?                                                                              | The statements give the node geometry, the depth, and the size. The prompt stays open.                                                                                            | REQ-009, REQ-032, REQ-192                | customer | open   |
| [Q-024](#q-024) | Does the console live in the CLI package or in its own package, and which stack does it use?                                            | C-012 splits client and backend code, and the console is client code.                                                                                                             | REQ-046                                  | customer | open   |
| [Q-026](#q-026) | Which retry limit and which length ratio do the writer and the card build use?                                                          | OptChat gives five tries. elephant-memory took three tries, accepts a line up to 1.25 times the limit, and asks 0.75 of the limit on a retry. Our values must agree with the cap. | REQ-051, REQ-197                         | customer | open   |
| [Q-027](#q-027) | Which rule moves the excess into `longform`: a cut at a word boundary, or the tail as it is? Does the tool make the move, or the model? | The rule decides what the tree keeps and what the document keeps.                                                                                                                 | REQ-011                                  | customer | open   |
| [Q-030](#q-030) | How does a merge join a sanitized event and a full event with one `id`?                                                                 | An import can bring the full event of a note that a local `redact` event cleared.                                                                                                 | REQ-078, REQ-082                         | customer | open   |
| [Q-093](#q-093) | Does a `body` above 512 bytes give `LineTooLong`, or does the text above the limit move into `longform`? | S-070 gives the error, and the closed Q-025 gives the move. | REQ-011, REQ-303 | customer | open |
| [Q-094](#q-094) | Does `memory_note` take `reviewIn`? | S-070 gives the field, and REQ-245 refuses it. | REQ-245, REQ-294 | customer | open |
| [Q-095](#q-095) | Which review period does each `kind` give? | A write without `reviewIn` needs the value of its kind. | REQ-309 | customer | open |
| [Q-096](#q-096) | Does `memory_forget` take `targets` and `scope`, or `target` only? | S-070 gives the array, and S-067 gives one target. | REQ-295, REQ-338 | customer | open |
| [Q-097](#q-097) | Which field of the `memory_forget` answer holds a proposal? | The answer holds three counts, and a forget of an invisible scope gives a proposal. | REQ-339, REQ-349 | customer | open |
| [Q-098](#q-098) | Does `memory_note` take `idem`, or does the store set it? | The signature has no `idem`, and S-070 gives idempotency by `idem`. | REQ-307 | customer | open |
| [Q-099](#q-099) | Is the default write scope the active scope or the `default` key of `[scope_default]`? | S-070 gives the write scope of the profile, and two keys can give it. | REQ-310 | customer | open |
| [Q-100](#q-100) | Does the filter of `memory_find` keep the name `due`? | The glossary gives `due` to the priority of the fold. | REQ-314 | customer | open |

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

### Q-093

S-070 gives `LineTooLong` above 512 bytes. The closed Q-025 gives the move of the excess into
`longform`. Q-027 depends on this answer.

- Option A: the store refuses a body above 512 bytes with `LineTooLong`. Q-027 leaves.
- Option B: the store keeps the excess in the `longform`. Q-093 leaves and Q-027 stays.

### Q-094

S-070 gives `reviewIn` on the write. S-058 and S-059 use it for the dedup and for `review_at`, and the
closed Q-077 gives the period in days. REQ-245 refuses the field.

- Option A: `memory_note` takes `reviewIn`, and REQ-245 leaves.
- Option B: the write takes no `reviewIn`, and the `review` event gives the date.

### Q-095

A write without `reviewIn` takes the period of its `kind`. The statement gives no value.

- Option A: `180d` for each kind, and `never` for `task`.
- Option B: the profile gives the period of each kind in the configuration.

### Q-096

S-070 gives `targets` and `scope`. The policy text of S-067 gives `memory_forget(target, reason)`.

- Option A: `targets` and `scope`. One call changes many records, and REQ-295 leaves.
- Option B: `target` only. The agent calls the tool one time for each record.

### Q-097

The table of the permissions gives the state `proposed` for a `forget` of an invisible scope. The
answer of `memory_forget` holds `hidden`, `rebuildsQueued`, and `cardsQueued` only.

- Option A: the answer adds a `proposed` count. The record stays, and a human decides.
- Option B: the call gives `NotAllowed`. Only the `note` makes a proposal.

### Q-098

S-070 gives idempotency by `idem`, and the signature of the tool holds no `idem`.

- Option A: `idem` is an optional field of the call. A retry uses the same value.
- Option B: the store sets `idem` from the call id of the harness. The agent gives no value.

### Q-099

S-070 gives the write scope of the profile. The profile has the `default` key of `[scope_default]` and
an active scope that the rules give.

- Option A: the active scope of the session. It agrees with the address with no scope.
- Option B: the `default` key of `[scope_default]`. The scope is the same in each session.

### Q-100

The glossary gives `due` to the priority of the fold, and S-070 gives `due` as a filter of
`memory_find`.

- Option A: the filter keeps `due`, and the priority of the fold takes a new name.
- Option B: the priority keeps `due`, and the filter takes a new name.

## Closed questions

| ID    | Question                                                                      | Answer                                                                                                                                             | Date       |
| ----- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Q-001 | Which stack and language does the project use?                                | TypeScript on Node.js with pnpm workspaces. See [D-005](04-decisions.md).                                                                          | 2026-11-04 |
| Q-002 | What does the library do?                                                     | The library is the memory engine: the log of notes, the tree of retellings, the catalog, and the slice. See S-013.                                 | 2026-11-04 |
| Q-025 | Does the 512-byte cap hold, or does the system accept a tolerance?            | The declared size is 384 bytes and the real maximum is 512 bytes. Text above the limit moves into `longform`. See S-015.                           | 2026-11-04 |
| Q-003 | What are the package names, the binary name, and the plugin identifier?       | `@memlens/core`, `@memlens/cli`, `@memlens/dsh-plugin`, binary `memlens`, plugin identifier `dsh-memlens`. See [D-005](04-decisions.md).           | 2026-11-04 |
| Q-016 | Which event types does the log have, and which ids identify them?             | Seven ops. The `id` of an event is a ULID, and it is the identity. See S-016.                                                                      | 2026-11-04 |
| Q-028 | Does the record of a note keep `reviewed_at`?                                 | No. The record keeps `review_at` only, and the `review` event gives the date of the check. See S-017.                                              | 2026-11-04 |
| Q-032 | What does `ts` hold, and how does it differ from `at`?                        | `at` gives the time of the log, and `ts` gives the time of the write. See S-017.                                                                   | 2026-11-04 |
| Q-029 | Does `target` name the `note` event, or the newest event of the note?         | The `note` event. The address of a note does not change after an amend. See S-018.                                                                 | 2026-11-04 |
| Q-033 | Does `sourceId` stay the key of an import, or does `idem` replace it?         | `idem`. The prior-art table gives principles, not field names, and the model holds no `sourceId`. See S-018.                                       | 2026-11-04 |
| Q-031 | Do all events carry `session`, `turn`, and `preset`, or the note only?        | The `note` event only. The agent gives the three fields when it calls the tool. See S-019.                                                         | 2026-11-04 |
| Q-034 | Does a `hide` event on a proposed note remove it from the review queue?       | No. The state stays `proposed` and the note leaves the view only. See S-021.                                                                       | 2026-11-04 |
| Q-035 | Does `dismiss` apply to a note that is not proposed?                          | Each state. A live note becomes `deleted` after a `dismiss`. See S-021.                                                                            | 2026-11-04 |
| Q-036 | Does a hidden proposed record enter the view after an `accept`?               | Yes. The `accept` clears the effect of the earlier `hide` event. See S-022.                                                                        | 2026-11-04 |
| Q-037 | Does `scrub` come back, or does the model keep no such step?                  | No `scrub`. A `redact` event gives the sanitized form, and the store extends it to each card. See S-024.                                           | 2026-11-04 |
| Q-038 | Which required fields of a note does a card carry?                            | None of `review_at`, `proposed`, `turn`, and `preset`. A card is not reviewed and not proposed. See S-024.                                         | 2026-11-04 |
| Q-039 | Do `ts_from`/`ts_to` hold the `ts` values, or the `at` values?                | The `ts` values, the time of the write. See S-026.                                                                                                 | 2026-11-04 |
| Q-040 | Is a level 0 node a separate summary, or the record itself?                   | The record itself. The tree holds no node of level 0. See S-028.                                                                                   | 2026-11-04 |
| Q-042 | In which order does the frontier render the levels?                           | From the oldest to the newest: the coarse lines first. See S-029.                                                                                  | 2026-11-04 |
| Q-043 | In which order does the writer take the dirty nodes?                          | The node with the oldest `built_at` first, and a node waits for its children. See S-031.                                                           | 2026-11-04 |
| Q-044 | Where does the description of a scope live?                                   | Nowhere. The model holds no description field, and the first note gives the text. See S-033.                                                       | 2026-11-04 |
| Q-045 | Does an alias join the records of the old key to the new key?                 | No alias. A wrong key changes by an amend of the record. See S-033.                                                                                | 2026-11-04 |
| Q-046 | Does `amend` change the scope of a note, or does a new op do it?              | The optional `scope` field of `amend`. A record with `content_cleared` moves too. See S-034.                                                       | 2026-11-04 |
| Q-009 | Where do the writable scopes of a profile come from?                          | Each scope of the profile is writable. No read-only set. See S-038.                                                                                | 2026-11-04 |
| Q-049 | What does a write do in a scope outside the profile?                          | The note becomes `proposed` and waits for a human. See S-039.                                                                                      | 2026-11-04 |
| Q-050 | Which order does the fold take: `built_at` or `due`?                          | `due` only. The fold and the rebuild use one order. See S-041.                                                                                     | 2026-11-04 |
| Q-051 | Where do `high` and `low` come from?                                          | `high` is the budget of the part, and `low` is its half. See S-041.                                                                                | 2026-11-04 |
| Q-052 | Does the fold build the parent, or does it wait for a built parent?           | The fold builds nothing. The writer builds each node. See S-041.                                                                                   | 2026-11-04 |
| Q-053 | Does the store of memlens keep the text of a snapshot?                        | No. The plugin renders the text and the harness keeps the copy. See S-046.                                                                         | 2026-11-04 |
| Q-054 | Does the store keep the history of snapshots?                                 | No record at all. The store of memlens holds no snapshot. See S-046.                                                                               | 2026-11-04 |
| Q-056 | What gives one text at each assembly between the triggers?                    | The last snapshot of the session history. The plugin gives that text again. See S-047.                                                             | 2026-11-04 |
| Q-057 | Does a `redact` reach the copy of the slice in the session history?           | No, and that stays. The model saw the text, and the log belongs to the harness. See S-047.                                                         | 2026-11-04 |
| Q-011 | Which fields does a snapshot hold?                                            | `id`, `session`, `profile`, `reason`, `at`, `text`, `bytes`, `parts`, and `scopes`. See S-042.                                                     | 2026-11-04 |
| Q-018 | Where does the model cache TTL come from?                                     | `cacheTtl`: 2 hours for `deepseek/*`, 5 minutes for `anthropic/*`, 1 hour for another model. See S-042.                                            | 2026-11-04 |
| Q-047 | What does the `here` budget cover, and is `slice` the sum?                    | The `slice` budget leaves. `here` limits the tree of the current project and `directions` the catalog tree. See S-037.                             | 2026-11-04 |
| Q-048 | What does each subagent mode allow?                                           | `propose` writes and reports, `read` reads only, `off` gives no tool and no slice. See S-037.                                                      | 2026-11-04 |
| Q-041 | What makes a pair of nodes overdue?                                           | No measure. A node is dirty when a source changes, and the writer works on dirty nodes. See S-030.                                                 | 2026-11-04 |
| Q-058 | When does the model write the card?                                           | Each build calls the model, and the fallback covers a missing model only. See S-050.                                                               | 2026-11-04 |
| Q-059 | Which order gives the three last records of the fallback?                     | `ts`, the time of the write. See S-050.                                                                                                            | 2026-11-04 |
| Q-060 | Where does the cut of the fallback fall?                                      | At a word boundary, then at a character boundary for a word above 512 bytes. See S-050.                                                            | 2026-11-04 |
| Q-061 | What does the build do when the model fails or overflows?                     | A retry, then the fallback. The retry limit is open. See Q-026 and S-050.                                                                          | 2026-11-04 |
| Q-062 | What does the build give with no live record of the session?                  | No card. The scope keeps its earlier card. See S-050.                                                                                              | 2026-11-04 |
| Q-063 | Do the two forms of the parallelism apply at one time?                        | One form for one run. The form `parallel` gives 6 calls of one line, and the form `batch` gives one call of 6 lines. See S-052.                    | 2026-11-04 |
| Q-064 | Is `gen` the `storeRev` or a counter of each block?                           | A counter of each block. An event in the range of the block grows it. See S-052.                                                                   | 2026-11-04 |
| Q-065 | Which budget does the 1.5 check use?                                          | Each part against its own budget: `here` and `directions`. See S-052.                                                                              | 2026-11-04 |
| Q-066 | What does a failed job do after the third wait?                               | It waits 300 seconds after each later failure and stays in the queue. See S-052.                                                                   | 2026-11-04 |
| Q-067 | Which idle time starts the compaction?                                        | A setting of the configuration file. The section, the key, and the default are open. See Q-068 and S-052.                                          | 2026-11-04 |
| Q-068 | Which section, key, and default does the idle time have?                      | The key `idle` of the `store` section, and 300 seconds by default. See S-053.                                                                      | 2026-11-04 |
| Q-069 | What decides the form of the compactor?                                       | The key `writer.mode` of the plugin config, and `auto` by default. See S-067 and S-068.                                                            | 2026-11-04 |
| Q-070 | Does a `redact` remove the rendered text of the slice?                        | No. The copy in the session history stays, and step 4 of S-054 has no object. See S-055.                                                           | 2026-11-04 |
| Q-071 | Which budget does the 1.5 limit of the cut use?                               | Each part against its own budget, as Q-065. See S-057.                                                                                             | 2026-11-04 |
| Q-072 | Which lines does the cut take?                                                | The oldest lines of `<here>`. The `<directions>` block keeps its lines. See S-057.                                                                 | 2026-11-04 |
| Q-012 | Which keys and which default does the nudge have?                             | The `[nudge]` section: `mode` `tools`, `tool_calls` 10, `turns` 10, `expensive` 5, and the text. See S-058.                                        | 2026-11-04 |
| Q-075 | What does each mode of the nudge count?                                       | `tool_calls` and `turns` are counters that run in parallel. `expensive` marks a long turn that demands a write. See S-059.                         | 2026-11-04 |
| Q-076 | Which normalization does the dedup apply?                                     | The trim and the runs of spaces, as at any other write. See S-059.                                                                                 | 2026-11-04 |
| Q-077 | How does `reviewIn` become `review_at`?                                       | A period in days, added to the time of the write. See S-059.                                                                                       | 2026-11-04 |
| Q-078 | Which signal tells the form `auto` that a cache serves the prefix?            | The family of the model. A model in `cacheTtl` gives `parallel`, and another model gives `batch`. See S-062.                                       | 2026-11-04 |
| Q-079 | What is the one reseed of a broken batch answer?                              | The retry tells the model the error. The size is the likely error. See S-062.                                                                      | 2026-11-04 |
| Q-080 | Which scope and which effect does `maxCallsPerHour` have?                     | One store. A call above the limit waits, and the job returns to the queue. See S-062.                                                              | 2026-11-04 |
| Q-081 | Which key does the catalog scope have under the new grammar?                  | A hidden technical key. The grammar covers the keys that the agent sees, and `__catalog__` stays outside it. See S-064.                            | 2026-11-04 |
| Q-084 | Is `workspace:<id>` a scope key?                                              | `workspace:<id> → key` is a rule for the scope, and `workspace` stays out of the kind list. See S-064.                                             | 2026-11-04 |
| Q-089 | Does the agent type `#2107` or `2107`?                                        | `2107`. The `#` belongs to the render form, and the tool strips it. See S-064.                                                                     | 2026-11-04 |
| Q-082 | Is `pos` the ordinal in the store, or the ordinal in the scope?               | The ordinal in the store. The scope narrows the count to that scope. See S-065.                                                                    | 2026-11-04 |
| Q-083 | Do the items take the words `kind` and `workspace`, or do the old items?      | No new terms. `kind` stays `kind`, and `workspace` stays `workspace`. See S-065.                                                                   | 2026-11-04 |
| Q-085 | Which part of the match does `{repo}` take?                                   | The repository name from the remote. See S-065.                                                                                                    | 2026-11-04 |
| Q-086 | Does a scope kind change the behavior?                                        | No. A kind is a label. See S-065.                                                                                                                  | 2026-11-04 |
| Q-087 | Does `active_profile` choose the profile, or does the preset of the harness?  | The key leaves `[scope_default]`. The preset gives `profile`. See Q-020 and S-067.                                                                 | 2026-11-04 |
| Q-088 | Does `*` also stand for the kind, as in `*:prefs`?                            | Both places. `*` matches any kind and any text of the name, and the key `*` matches each scope. See S-066.                                         | 2026-11-04 |
| Q-090 | What does the store do with `project:Dsh`, a key outside the grammar?         | The store lowercases the key and writes it. See S-066.                                                                                             | 2026-11-04 |
| Q-020 | Which value wins in the merge of the main configuration and the preset?       | The preset gives `profile`, and the general config gives `defaultProfile`. The preset wins. See S-067.                                             | 2026-11-04 |
| Q-055 | Which fields does the rendered snapshot carry?                                | The text only. The harness runtime context carries it, and memlens stores no snapshot record. See S-067.                                           | 2026-11-04 |
| Q-073 | What input and what output does `memory_open` have?                           | The address only. A leaf gives the note and its `longform`. A node gives its two child lines. See S-067.                                           | 2026-11-04 |
| Q-074 | What does the one line of an old scope hold in `<directions>`?                | The scope, the age or `active`, the count of notes, and the description. The directions budget limits the detail lines. See S-067.                 | 2026-11-04 |
| Q-091 | Does `budget.slice` return as a total budget?                                 | No change. The budget is `here` and `directions`. The `slice` in S-067 is an example, not a config key. See S-068 and S-069.                       | 2026-11-05 |
| Q-092 | What does the last line of `<directions>` hold, and when is a scope archived? | No archived state. The line is an example. See S-068.                                                                                              | 2026-11-05 |
| Q-010 | What is the form of the map of directions, and what is its size limit?        | The `<memory>` block with the policy text, `<directions>`, and `<here>`. The budgets `here` and `directions` give the limits. See S-067 and S-068. | 2026-11-05 |
| Q-013 | What input and what output does `memory_review` have? | The input holds `scope`, `reviewed`, and `reviewIn`. The answer gives the due records, then the count and the next date. See S-070 and REQ-340 to REQ-344. | 2026-11-05 |
| Q-017 | Who sets `review_at`, and what is the review queue? | The write sets `review_at` from `reviewIn`, and the `review` event sets it too. The queue is the due answer of `memory_review`. See S-070. | 2026-11-05 |
| Q-022 | What is the form of the line about a subagent write in the parent report? | One line for each proposal: the tag `[memory proposals from <session id>]`, the `addr`, and the `body`. See S-070 and REQ-359. | 2026-11-05 |
| Q-023 | Is `longform` available by address, in the slice, or in both? | The tool `memory_open` gives the `longform` with `head` or `all`. The slice holds no `longform`. See S-070. | 2026-11-05 |
