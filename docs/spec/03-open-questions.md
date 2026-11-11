# Open questions

A blocking question stops the current portion of the specification until the customer answers it.

No question is open.

## Open questions

None.

## Closed questions

### Q-463

Does the write boundary keep idem?

The write boundary removes the key. Content comparison prevents duplicate live notes without supersedes.
Imports join events by id. This decision replaces the idem parts of Q-033, Q-098, Q-101, and Q-114.
The historical answers below retain their original context.


### Q-462

The customer settles these conflicting forms directly in [S-142](../statements.md#s-142). No further selection is pending.

| Area | Earlier form | Selected form |
| --- | --- | --- |
| Fold | Continue to half the budget, or require a ready parent. | Stop at the first fit and use temporary lines for unready ranges. |
| Transfer | Keep the address across every amendment. | A content edit keeps its address. A scope transfer gets a new destination slot. |
| Proposals | Add an accepts field and a separate decision form. | Use proposed true on an ordinary operation and apply ordinary writes. |
| Markdown | Import the human export as a record recovery format. | Export only, with encoded scope filenames. JSONL transfers events. |
| Writer | Persist jobs and leases, and let rendering wait. | Derive ordered candidates, retain only transient attempts, and render immediately. |

### Q-461

Which log form preserves selective invalidation after an import and a restart?

The customer selected option A: an explicit `invalidate` event with node ids as targets.
Option B was a marker inside a `node` event. The log has eight ops.
See [S-135](../statements.md#s-135) and [0015 Node invalidation](../adr/0015-node-invalidation.md).

| ID    | Question                                                                      | Answer                                                                                                                                             | Date       |
| ----- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Q-001 | Which stack and language does the project use?                                | TypeScript on Node.js with pnpm workspaces. See [0010 Process and stack](../adr/0010-process-stack.md).                                                                          | 2026-11-04 |
| Q-002 | What does the library do?                                                     | The library is the memory engine: the log of notes, the tree of retellings, the catalog, and the slice. See S-013.                                 | 2026-11-04 |
| Q-025 | Does the 512-byte cap hold, or does the system accept a tolerance?            | The declared size is 384 bytes and the real maximum is 512 bytes. Text above the limit moves into `longform`. See S-015.                           | 2026-11-04 |
| Q-003 | What are the package names, the binary name, and the plugin identifier?       | `@memlens/core`, `@memlens/cli`, `@memlens/dsh-plugin`, binary `memlens`, plugin identifier `dsh-memlens`. See [0010 Process and stack](../adr/0010-process-stack.md).           | 2026-11-04 |
| Q-016 | Which event types does the log have, and which ids identify them?             | Seven ops. The `id` of an event is a ULID, and it is the identity. See S-016.                                                                      | 2026-11-04 |
| Q-028 | Does the record of a note keep `reviewed_at`?                                 | No. The record keeps `review_at` only, and the `review` event gives the date of the check. See S-017.                                              | 2026-11-04 |
| Q-032 | What does `ts` hold, and how does it differ from `at`?                        | `at` gives the time of the log, and `ts` gives the time of the write. See S-017.                                                                   | 2026-11-04 |
| Q-029 | Does `target` name the `note` event, or the newest event of the note?         | The `note` event. The address of a note does not change after an amend. See S-018.                                                                 | 2026-11-04 |
| Q-033 | Does `sourceId` stay the key of an import, or does `idem` replace it?         | `idem`. The prior-art table gives principles, not field names, and the model holds no `sourceId`. See S-018.                                       | 2026-11-04 |
| Q-031 | Do all events carry `session`, `turn`, and `preset`, or the note only?        | The `note` event only. The agent gives the three fields when it calls the tool. See S-019.                                                         | 2026-11-04 |
| Q-034 | Does a `hide` event on a proposed note remove it from the review queue?       | No. The state stays `proposed` and the note leaves the view only. See S-021.                                                                       | 2026-11-04 |
| Q-035 | Does `dismiss` apply to a note that is not proposed?                          | Each state. A live note becomes `deleted` after a `dismiss`. See S-021.                                                                            | 2026-11-04 |
| Q-036 | Does a hidden proposed record enter the view after an `accept`?               | Yes. The `accept` clears the effect of the earlier `hide` event. See S-022.                                                                         Superseded by Q-457: a proposed record has no state. | 2026-11-04 |
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
| Q-051 | Where do `high` and `low` come from?                                          | The part budget is the only fold threshold. The fold stops as soon as rendered lines fit. Updated by S-142. | 2026-11-04 |
| Q-052 | Does the fold build the parent, or does it wait for a built parent?           | The fold builds nothing. The writer builds each node. See S-041.                                                                                   | 2026-11-04 |
| Q-053 | Does the store of memlens keep the text of a snapshot?                        | No. The plugin renders the text and the harness keeps the copy. See S-046.                                                                         | 2026-11-04 |
| Q-054 | Does the store keep the history of snapshots?                                 | No record at all. The store of memlens holds no snapshot. See S-046.                                                                               | 2026-11-04 |
| Q-056 | What gives one text at each assembly between the triggers?                    | The last snapshot of the session history. The plugin gives that text again. See S-047.                                                             | 2026-11-04 |
| Q-057 | Does a `redact` reach the copy of the slice in the session history?           | No, and that stays. The model saw the text, and the log belongs to the harness. See S-047.                                                         | 2026-11-04 |
| Q-011 | Which fields does a snapshot hold?                                            | The store keeps no snapshot. The runtime context carries the text only. See Q-055 and S-067.                                                       | 2026-11-04 |
| Q-018 | Where does the model cache TTL come from?                                     | `cacheTtl`: 2 hours for `deepseek/*`, 5 minutes for `anthropic/*`, 1 hour for another model. See S-042.                                            | 2026-11-04 |
| Q-047 | What does the `here` budget cover, and is `slice` the sum?                    | `here` limits the tree of the active scope, and `directions` limits the catalog tree. See Q-112.                             | 2026-11-04 |
| Q-048 | What does each subagent mode allow?                                           | `propose` writes and reports, `read` reads only, `off` gives no tool and no slice. See S-037.                                                      | 2026-11-04 |
| Q-041 | What makes a pair of nodes overdue?                                           | No measure. A node is dirty when a source changes, and the writer works on dirty nodes. See S-030.                                                 | 2026-11-04 |
| Q-058 | When does the model write the card?                                           | Each build calls the model, and the fallback covers a missing model only. See S-050.                                                               | 2026-11-04 |
| Q-059 | Which order gives the three last records of the fallback?                     | `ts`, the time of the write. See S-050.                                                                                                            | 2026-11-04 |
| Q-060 | Where does the cut of the fallback fall?                                      | At a word boundary, then at a character boundary for a word above 512 bytes. See S-050.                                                            | 2026-11-04 |
| Q-061 | What does the build do when the model fails or overflows?                     | A retry, then the fallback. Q-026 gives the retry limit. See Q-026 and S-050.                                                                      | 2026-11-04 |
| Q-062 | What does the build give with no live record of the session?                  | No card. The scope keeps its earlier card. See S-050.                                                                                              | 2026-11-04 |
| Q-063 | Do the two forms of the parallelism apply at one time?                        | One form for one run. The form `parallel` gives 6 calls of one line, and the form `batch` gives one call of 6 lines. See S-052.                    | 2026-11-04 |
| Q-064 | Is `gen` the `storeRev` or a counter of each block?                           | A counter of each block. An event in the range of the block grows it. See S-052.                                                                   | 2026-11-04 |
| Q-065 | Which budget does the 1.5 check use?                                          | Each part against its own budget: `here` and `directions`. See S-052.                                                                              | 2026-11-04 |
| Q-066 | What does a failed job do after the third wait?                               | Local writer retry waits are ten, sixty, then three hundred seconds. No persistent queue or lease exists. Updated by S-142. | 2026-11-04 |
| Q-067 | Which idle time starts the compaction?                                        | The key `idle` of the `store` section, and 300 seconds by default. See Q-068 and S-053.                                                            | 2026-11-04 |
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
| Q-080 | Which scope and which effect does `maxCallsPerHour` have?                     | One store. A call above the limit waits while its candidate remains dirty, without queue reinsertion. Updated by S-142. | 2026-11-04 |
| Q-081 | Which key does the catalog scope have under the new grammar?                  | A hidden technical key. The grammar covers the keys that the agent sees, and `__catalog__` stays outside it. See S-064.                            | 2026-11-04 |
| Q-084 | Is `workspace:<id>` a scope key?                                              | `workspace:<id> → key` is a rule for the scope, and `workspace` stays out of the kind list. See S-064.                                             | 2026-11-04 |
| Q-089 | Does the agent type `#2107` or `2107`?                                        | `2107`. The `#` belongs to the render form, and the tool strips it. See S-064.                                                                     | 2026-11-04 |
| Q-082 | Is `pos` the ordinal in the store, or the ordinal in the scope?               | The ordinal in the scope. See Q-111 and S-088.                                                                    | 2026-11-04 |
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
| Q-093 | Does a `body` above 512 bytes give `LineTooLong`, or does the text above the limit move into `longform`? | The text above the limit moves into the `longform`. Q-027 gives the rule of the move. See S-071.                                                   | 2026-11-05 |
| Q-094 | Does `memory_note` take `reviewIn`? | Yes. The write takes `reviewIn`, and REQ-245 is `rejected`. See S-071. | 2026-11-05 |
| Q-095 | Which review period does each `kind` give? | 365 days for `decision`, `preference`, and `note`. 180 days for `fact`. 7 days for `task`. See S-071. | 2026-11-05 |
| Q-096 | Does `memory_forget` take `targets` and `scope`, or `target` only? | The field is `targets`. A `pos` target needs `scope`, and an `addr` target needs none. See S-071. | 2026-11-05 |
| Q-098 | Does `memory_note` take `idem`, or does the store set it? | The tool call makes `idem`. The agent gives no value. See S-071. | 2026-11-05 |
| Q-099 | Is the default write scope the active scope or the `default` key of `[scope_default]`? | The active scope of the session. See S-071. | 2026-11-05 |
| Q-100 | Does the filter of `memory_find` keep the name `due`? | The filter keeps `due`. It has no relation to the priority of the fold. See S-071. | 2026-11-05 |
| Q-027 | Which rule moves the excess into `longform`: a cut at a word boundary, or the tail as it is? Does the tool make the move, or the model? | The write mechanism cuts the text mechanically at a word boundary and moves the rest into the `longform`. See S-072. | 2026-11-05 |
| Q-097 | Which field of the `memory_forget` answer holds a proposal? | The answer gives `hidden: 0`. The proposal stays invisible to the agent. See S-072. | 2026-11-05 |
| Q-030 | How does a merge join a sanitized event and a full event with one `id`? | The events of a record with a `redact` go in the sanitized form, in each order. See S-073 and REQ-384. | 2026-11-05 |
| Q-019 | What is the export and import format, and how does `redact` block a restore?  | Markdown is export-only. JSONL transfers store events. Scope keys map to encoded flat filenames. Updated by S-142. | 2026-11-05 |
| Q-102 | What does `memlens import --from dsh-sessions` read, and what records does it write? | The writer reads each session and writes new notes into the store. See S-076 and REQ-413. | 2026-11-05 |
| Q-103 | Does the text of `memlens describe` set the `title` or the `description`? | The CLI has no `describe` command. The tool `memory_scope` lists the scopes only. See Q-117 and S-076. | 2026-11-05 |
| Q-104 | Must the target of `--into` be one of the two stores of `memlens merge`? | The CLI has no `merge` command. The import makes the merge. See S-076. | 2026-11-05 |
| Q-105 | What does the directory of `--out` hold for each format? | An export takes the optional `--scope`. With no flag it writes one file for each scope, and with the flag one scope. See S-076. | 2026-11-05 |
| Q-101 | Is an import joined by `id` or by `idem`? | The import and the merge join by `id`, and the key `idem` guards a repeated write. The two rules hold together. See S-073 and S-076. | 2026-11-05 |
| Q-106 | Which screens does the tab `Memory` hold? | The tab holds each screen. It has no catalog of profiles, because the profile of the session is current. See S-078. | 2026-11-05 |
| Q-107 | Does the tab write, or does it read only? | The tab is a piece of the UI. A human does each action there, as in the full console. See S-078. | 2026-11-05 |
| Q-004 | What does "localization" include: the product interface, the documents, or both? | The product interface, the READMEs, and the installation and usage instructions. See S-081. | 2026-11-05 |
| Q-005 | Which DSH version does the plugin support? | DeepSeek Harness 0.2.1 and later. See S-081. | 2026-11-05 |
| Q-006 | Does the plugin use the library? | The plugin uses the functions of the core library. See S-081. | 2026-11-05 |
| Q-007 | Which license does the project use? | MIT. See S-081. | 2026-11-05 |
| Q-008 | Which languages does the plugin package README take?                          | The README of the plugin package takes the eight languages of the DSH set. See Q-108 and S-082.                                                    | 2026-11-05 |
| Q-024 | Does the console live in the CLI package or in its own package, and which stack does it use? | The UI core is in the core library, and the CLI package hosts the full console. The plugin uses the components of the harness UI, and no package stands alone. See S-077, S-080, and S-081. | 2026-11-05 |
| Q-026 | Which retry limit and which length ratio do the writer and the card build use? | A merge makes three attempts at most with a request of 0.75 times the target, and the answer is the shortest. See S-082 and REQ-436. | 2026-11-05 |
| Q-021 | What is the retelling prompt of the tree, and of the card? | The merge takes the system prompt and the task text of S-082, and the card takes its task text. See 09-prompts.md. | 2026-11-05 |
| Q-108 | Which two languages join the three of the project? | The eight languages of the DSH set: `de`, `en`, `es`, `fr`, `ja`, `pt`, `ru`, and `zh`. See S-082. | 2026-11-05 |
| Q-110 | Is the budget of the slice one total of 24 KiB with three parts, or two independent budgets? | The profile gives two budgets, `here` and `directions`, and no total. The budgets count lines. The fallback profile gives 20 lines and 10 lines. See S-084 and S-144. | 2026-11-05 |
| Q-014 | Which surface does the session mode of the console use in the harness? | The tab mounts in the slot `conversation.session.header`, and the kind is `memlens`. See S-085 and REQ-446. | 2026-11-05 |
| Q-015 | Which operations does the index port have? | The port gives the `pos` and the line of each hit. The index shares no transaction with the log. The tokenizer follows `language`. The rest is in [0003 Store](../adr/0003-store.md). See S-085. | 2026-11-05 |
| Q-111 | Is `pos` the ordinal in the store, or the ordinal in the scope?               | The ordinal in the scope. See Q-082 and S-088.                                                                                                     | 2026-11-05 |
| Q-112 | Does the budget `here` limit the tree of the current project, or the tree of the active scope? | The active scope of the session. The `[scope_default]` rules select the scope, and the tree follows it. See Q-047 and S-088.                                      | 2026-11-05 |
| Q-113 | Does the slice stay the same for the whole session, or does a trigger replace the text inside the session? | The text changes at a compaction and at an idle time above the TTL. A turn, a write, and a process restart change no text. The plugin gives the text. See S-088. | 2026-11-05 |
| Q-114 | Does an import join the events by `id` or by `idem`?                          | The events join by `id`. The key `idem` stops a repeated write of one tool call. See Q-101 and S-088.                                              | 2026-11-05 |
| Q-116 | Does the product localize eight languages, or English, Russian, and Chinese?  | The eight languages of the DSH set: `de`, `en`, `es`, `fr`, `ja`, `pt`, `ru`, and `zh`. See Q-108 and S-088.                                       | 2026-11-05 |
| Q-117 | Where does the store keep the `title` and the `description` of a scope?       | None. A scope has a name only. The first node of the scope gives the text. See Q-044 and S-088.                                                    | 2026-11-05 |
| Q-118 | Does a `redact` rewrite the target `note` event, or does it keep the event and remove the old bytes? | The `redact` event is new. The content of the old event becomes empty. See the [sanitization contract](../../packages/core/src/domain/sanitization.ts) and S-088.                                                      | 2026-11-05 |
| Q-115 | Does the card render in `<directions>` or in `<here>`?                        | The card is the direction line. `<here>` holds no card line. See S-089.                                                                            | 2026-11-05 |
| Q-456 | What does the policy text of the slice hold? | The research of the prior art gives the text. The first form was the block of [S-067](../statements.md#s-067). See [S-130](../statements.md#s-130) and [REQ-509](02-requirements.md). | 2026-11-06 |
| Q-457 | How does a proposal change an existing record? | An ordinary write operation can carry proposed true. Approval applies the ordinary operation and closes the proposal with dismiss. Updated by S-142. | 2026-11-06 |
| Q-458 | What happens to one `id` with two payloads at one `at`? | The payload with the greater SHA-256 of its canonical JSON wins, and the sanitized form wins over each payload. See [S-101](../statements.md#s-101) and the [conflict comparison contract](../../packages/core/src/domain/merge.ts). | 2026-11-06 |
| Q-459 | When does the index show a note that a write just added? | The index add is part of the append transaction in the SQLite backend and follows the append in the JSONL backend. A rebuild covers the gap. See [S-101](../statements.md#s-101) and the [sqlite contract](../../packages/core/src/storage/sqlite.ts). | 2026-11-06 |
| Q-460 | Which tokenizer does the index take for each language? | One value of `language` for the installation. `porter unicode61 remove_diacritics 1` for `en`, `unicode61 remove_diacritics 1` for the other languages with spaces, and `trigram` for `zh` and `ja`. See [S-101](../statements.md#s-101) and [REQ-450](02-requirements.md). | 2026-11-06 |
| Q-510 | Does a range with one non-empty child build a node? | Yes. The node copies the text and the dates of that child with no model call. The console shows the range line only, so a note never has two lines. See [S-144](../statements.md#s-144) and [REQ-516](02-requirements.md). | 2026-11-11 |
| Q-511 | Does a direction line of an unready scope hold its period? | No. The line holds the key, the age, and the count, and no text. The earlier form gave a date-only line. The here part keeps its temporary period. See [S-147](../statements.md#s-147) and [REQ-451](02-superseded.md). | 2026-11-11 |
| Q-512 | What does a direction line hold? | The keys, the idle time, and the summary. A line above one scope joins its keys and gives the range of the idle times. The line holds no count, no active marker, and no profile name. The earlier form gave the count and the `active` marker. See [S-148](../statements.md#s-148), [S-149](../statements.md#s-149), and [REQ-451](02-superseded.md). | 2026-11-11 |
