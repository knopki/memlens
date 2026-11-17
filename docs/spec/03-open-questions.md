# Open questions

A blocking question stops the current portion of the specification until the customer answers it.

## Open questions

### Q-514

Which rule turns a harness session into notes at the pending session import?

The requirement [REQ-413](02-requirements.md) says that the import writes new notes of each
session. The rule that selects the note text is open.

- Option A: The import gives the session text to the model with the compaction prompt. The answer
 of the model becomes the notes.
- Option B: The import reads the user messages of the session only. Each message becomes one note
 body, and the import calls no model.

### Q-515

Which command gives a copied store file a new identity?

The store identity is one value in `meta`, and it breaks each version tie. A file copy keeps the
identity, so two stores issue versions with one tie-break part. The design named a command, and the
CLI has no `store` command. See [0020 Storage pivot](./adr/0020-storage-pivot.md) and the
[schema contract](././packages/core/src/store/schema.ts).

- Option A: Add the command `memlens store new-id`. It writes one new identity.
- Option B: A user copies the store and imports it into a new one. No command exists.

### Q-516

Which rule applies a change of the `language` key to the index tokenizer?

The tokenizer is a value in `meta`. The index holds the tokenizer of its build. A change of the key
rebuilds nothing, and a plain open keeps the stored value. See the
[schema contract](././packages/core/src/store/schema.ts) and the
[search contract](././packages/core/src/store/search.ts).

- Option A: One explicit command drops and rebuilds the index in one transaction. A plain open with a
 mismatch logs a warning and keeps the stored tokenizer.
- Option B: `memlens repair` rebuilds the index, and the config change sets the key only.

### Q-517

Does the export take a version filter for a later import?

The export writes the whole store or one scope. The design named an incremental export as a filter on
the same rows, and the command has no such filter. See the
[transfer contract](././packages/core/src/store/transfer.ts).

- Option A: Add a filter by version. It writes the notes above one version.
- Option B: Keep the whole-store export. The import is idempotent, and no filter is necessary.

## Closed questions

The answers below keep the words of their date. The storage pivot replaced the event log, the
projection, the replay cursor, and the two backends. A closed answer that names one of them describes
the earlier design. See [0020 Storage pivot](./adr/0020-storage-pivot.md).
The customer removed the `memory_forget` counters on 2026-11-14. The revised [REQ-371](02-requirements.md) replaces the field in Q-097.
The customer removed the retry with the error text and the run forms on 2026-11-16.
[0023 Batch compaction](./adr/0023-batch-compaction.md) replaces Q-063, Q-069, Q-078, and Q-079.

### Q-463

Does the write boundary keep idem?

The write boundary removes the key. Content comparison prevents duplicate live notes without supersedes.
Imports join events by id. This decision replaces the idem parts of Q-033, Q-098, Q-101, and Q-114.
The historical answers below retain their original context.


### Q-462

The customer settled these conflicting forms directly. No further selection is pending.

| Area | Earlier form | Selected form |
| --- | --- | --- |
| Fold | Continue to half the budget, or require a ready parent. | Stop at the first fit and use temporary lines for unready ranges. |
| Transfer | Keep the address across every amendment. | A content edit keeps its address. A scope transfer gets a new destination slot. |
| Proposals | Add an accepts field and a separate decision form. | Use proposed true on an ordinary operation and apply ordinary writes. |
| Markdown | Import the human export as a record recovery format. | Export only, with encoded scope filenames. JSONL transfers events. |
| Compaction | Persist jobs and leases, and let rendering wait. | Derive ordered candidates, retain only transient attempts, and render immediately. |

### Q-461

Which log form preserves selective invalidation after an import and a restart?

The customer selected option A: an explicit `invalidate` event with node ids as targets.
Option B was a marker inside a `node` event. The log has eight ops.
See [0015 Node invalidation](./adr/0015-node-invalidation.md).

| ID | Question | Answer | Date |
| ----- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Q-001 | Which stack and language does the project use? | TypeScript on Node.js with pnpm workspaces. See [0010 Process and stack](./adr/0010-process-stack.md). | 2026-11-04 |
| Q-002 | What does the library do? | The library is the memory engine: the log of notes, the tree of retellings, the catalog, and the slice. | 2026-11-04 |
| Q-025 | Does the 512-byte cap hold, or does the system accept a tolerance? | The declared size is 384 bytes and the real maximum is 512 bytes. Text above the limit moves into `longform`. | 2026-11-04 |
| Q-003 | What are the package names, the binary name, and the plugin identifier? | `@memlens/core`, `@memlens/cli`, `@memlens/dsh-plugin`, binary `memlens`, plugin identifier `dsh-memlens`. See [0010 Process and stack](./adr/0010-process-stack.md). | 2026-11-04 |
| Q-016 | Which event types does the log have, and which ids identify them? | Seven ops. The `id` of an event is a ULID, and it is the identity. | 2026-11-04 |
| Q-028 | Does the record of a note keep `reviewed_at`? | No. The record keeps `review_at` only, and the `review` event gives the date of the check. | 2026-11-04 |
| Q-032 | What does `ts` hold, and how does it differ from `at`? | `at` gives the time of the log, and `ts` gives the time of the write. | 2026-11-04 |
| Q-029 | Does `target` name the `note` event, or the newest event of the note? | The `note` event. The address of a note does not change after an amend. | 2026-11-04 |
| Q-033 | Does `sourceId` stay the key of an import, or does `idem` replace it? | `idem`. The prior-art table gives principles, not field names, and the model holds no `sourceId`. | 2026-11-04 |
| Q-031 | Do all events carry `session`, `turn`, and `preset`, or the note only? | The `note` event only. The agent gives the three fields when it calls the tool. | 2026-11-04 |
| Q-034 | Does a `hide` event on a proposed note remove it from the review queue? | No. The state stays `proposed` and the note leaves the view only. | 2026-11-04 |
| Q-035 | Does `dismiss` apply to a note that is not proposed? | Each state. A live note becomes `deleted` after a `dismiss`. | 2026-11-04 |
| Q-036 | Does a hidden proposed record enter the view after an `accept`? | Yes. The `accept` clears the effect of the earlier `hide` event. Superseded by Q-457: a proposed record has no state. | 2026-11-04 |
| Q-037 | Does `scrub` come back, or does the model keep no such step? | No `scrub`. A `redact` event gives the sanitized form, and the store extends it to each card. | 2026-11-04 |
| Q-038 | Which required fields of a note does a card carry? | None of `review_at`, `proposed`, `turn`, and `preset`. A card is not reviewed and not proposed. | 2026-11-04 |
| Q-039 | Do `ts_from`/`ts_to` hold the `ts` values, or the `at` values? | The `ts` values, the time of the write. | 2026-11-04 |
| Q-040 | Is a level 0 node a separate summary, or the record itself? | The record itself. The tree holds no node of level 0. | 2026-11-04 |
| Q-042 | In which order does the frontier render the levels? | From the oldest to the newest: the coarse lines first. | 2026-11-04 |
| Q-043 | In which order does the compaction take the dirty nodes? | The node with the oldest `built_at` first, and a node waits for its children. | 2026-11-04 |
| Q-044 | Where does the description of a scope live? | Nowhere. The model holds no description field, and the first note gives the text. | 2026-11-04 |
| Q-045 | Does an alias join the records of the old key to the new key? | No alias. A wrong key changes by an amend of the record. | 2026-11-04 |
| Q-046 | Does `amend` change the scope of a note, or does a new op do it? | The optional `scope` field of `amend`. A record with `content_cleared` moves too. | 2026-11-04 |
| Q-009 | Where do the writable scopes of a profile come from? | Each scope of the profile is writable. No read-only set. | 2026-11-04 |
| Q-049 | What does a write do in a scope outside the profile? | The note becomes `proposed` and waits for a human. | 2026-11-04 |
| Q-050 | Which order does the fold take: `built_at` or `due`? | `due` only. The fold and the rebuild use one order. | 2026-11-04 |
| Q-051 | Where do `high` and `low` come from? | The part budget is the only fold threshold. The fold stops as soon as rendered lines fit. | 2026-11-04 |
| Q-052 | Does the fold build the parent, or does it wait for a built parent? | The fold builds nothing. The compaction builds each node. | 2026-11-04 |
| Q-053 | Does the store of memlens keep the text of a snapshot? | No. The plugin renders the text and the harness keeps the copy. | 2026-11-04 |
| Q-054 | Does the store keep the history of snapshots? | No record at all. The store of memlens holds no snapshot. | 2026-11-04 |
| Q-056 | What gives one text at each assembly between the triggers? | The last snapshot of the session history. The plugin gives that text again. | 2026-11-04 |
| Q-057 | Does a `redact` reach the copy of the slice in the session history? | No, and that stays. The model saw the text, and the log belongs to the harness. | 2026-11-04 |
| Q-011 | Which fields does a snapshot hold? | The store keeps no snapshot. The runtime context carries the text only. See Q-055. | 2026-11-04 |
| Q-018 | Where does the model cache TTL come from? | `cacheTtl`: 2 hours for `deepseek/*`, 5 minutes for `anthropic/*`, 1 hour for another model. | 2026-11-04 |
| Q-047 | What does the `here` budget cover, and is `slice` the sum? | `here` limits the tree of the active scope, and `directions` limits the catalog tree. See Q-112. | 2026-11-04 |
| Q-048 | What does each subagent mode allow? | `propose` writes and reports, `read` reads only, `off` gives no tool and no slice. | 2026-11-04 |
| Q-041 | What makes a pair of nodes overdue? | No measure. A node is dirty when a source changes, and the compaction works on dirty nodes. | 2026-11-04 |
| Q-058 | When does the model write the card? | Each build calls the model, and the fallback covers a missing model only. | 2026-11-04 |
| Q-059 | Which order gives the three last records of the fallback? | `ts`, the time of the write. | 2026-11-04 |
| Q-060 | Where does the cut of the fallback fall? | At a word boundary, then at a character boundary for a word above 512 bytes. | 2026-11-04 |
| Q-061 | What does the build do when the model fails or overflows? | A retry, then the fallback. Q-026 gives the retry limit. See Q-026. | 2026-11-04 |
| Q-062 | What does the build give with no live record of the session? | No card. The scope keeps its earlier card. | 2026-11-04 |
| Q-063 | Do the two forms of the parallelism apply at one time? | One form for one run. The form `parallel` gives 6 calls of one line, and the form `batch` gives one call of 6 lines. | 2026-11-04 |
| Q-064 | Is `gen` the `storeRev` or a counter of each block? | A counter of each block. An event in the range of the block grows it. | 2026-11-04 |
| Q-065 | Which budget does the 1.5 check use? | Each part against its own budget: `here` and `directions`. | 2026-11-04 |
| Q-066 | What does a failed job do after the third wait? | Local compaction retry waits are ten, sixty, then three hundred seconds. No persistent queue or lease exists. | 2026-11-04 |
| Q-067 | Which idle time starts the compaction? | The key `idle` of the `store` section, and 300 seconds by default. See Q-068. | 2026-11-04 |
| Q-068 | Which section, key, and default does the idle time have? | The key `idle` of the `store` section, and 300 seconds by default. | 2026-11-04 |
| Q-069 | What decides the form of the compactor? | The key `compaction.mode` of the plugin config, and `auto` by default. | 2026-11-04 |
| Q-070 | Does a `redact` remove the rendered text of the slice? | No. The copy in the session history stays. | 2026-11-04 |
| Q-071 | Which budget does the 1.5 limit of the cut use? | Each part against its own budget, as Q-065. | 2026-11-04 |
| Q-072 | Which lines does the cut take? | The oldest lines of `<here>`. The `<directions>` block keeps its lines. | 2026-11-04 |
| Q-012 | Which keys and which default does the nudge have? | The `[nudge]` section: `mode` `tools`, `tool_calls` 10, `turns` 10, `expensive` 5, and the text. | 2026-11-04 |
| Q-075 | What does each mode of the nudge count? | `tool_calls` and `turns` are counters that run in parallel. `expensive` marks a long turn that demands a write. | 2026-11-04 |
| Q-076 | Which normalization does the dedup apply? | The trim and the runs of spaces, as at any other write. | 2026-11-04 |
| Q-077 | How does `reviewIn` become `review_at`? | A period in days, added to the time of the write. | 2026-11-04 |
| Q-078 | Which signal tells the form `auto` that a cache serves the prefix? | The family of the model. A model in `cacheTtl` gives `parallel`, and another model gives `batch`. | 2026-11-04 |
| Q-079 | What is the one reseed of a broken batch answer? | The retry tells the model the error. The size is the likely error. | 2026-11-04 |
| Q-080 | Which scope and which effect does `maxCallsPerHour` have? | One store. A call above the limit waits while its candidate remains dirty, without queue reinsertion. | 2026-11-04 |
| Q-081 | Which key does the catalog scope have under the new grammar? | A hidden technical key. The grammar covers the keys that the agent sees, and `__catalog__` stays outside it. | 2026-11-04 |
| Q-084 | Is `workspace:<id>` a scope key? | `workspace:<id> → key` is a rule for the scope, and `workspace` stays out of the kind list. | 2026-11-04 |
| Q-089 | Does the agent type `#2107` or `2107`? | `2107`. The `#` belongs to the render form, and the tool strips it. | 2026-11-04 |
| Q-082 | Is `pos` the ordinal in the store, or the ordinal in the scope? | The ordinal in the scope. See Q-111. | 2026-11-04 |
| Q-083 | Do the items take the words `kind` and `workspace`, or do the old items? | No new terms. `kind` stays `kind`, and `workspace` stays `workspace`. | 2026-11-04 |
| Q-085 | Which part of the match does `{repo}` take? | The repository name from the remote. | 2026-11-04 |
| Q-086 | Does a scope kind change the behavior? | No. A kind is a label. | 2026-11-04 |
| Q-087 | Does `active_profile` choose the profile, or does the preset of the harness? | The key leaves `[scope_default]`. The preset gives `profile`. See Q-020. | 2026-11-04 |
| Q-088 | Does `*` also stand for the kind, as in `*:prefs`? | Both places. `*` matches any kind and any text of the name, and the key `*` matches each scope. | 2026-11-04 |
| Q-090 | What does the store do with `project:Dsh`, a key outside the grammar? | The store lowercases the key and writes it. | 2026-11-04 |
| Q-020 | Which value wins in the merge of the main configuration and the preset? | The preset gives `profile`, and the general config gives `defaultProfile`. The preset wins. | 2026-11-04 |
| Q-055 | Which fields does the rendered snapshot carry? | The text only. The harness runtime context carries it, and memlens stores no snapshot record. | 2026-11-04 |
| Q-073 | What input and what output does `memory_open` have? | The address only. A leaf gives the note and its `longform`. A node gives its two child lines. | 2026-11-04 |
| Q-074 | What does the one line of an old scope hold in `<directions>`? | The scope, the age or `active`, the count of notes, and the description. The directions budget limits the detail lines. | 2026-11-04 |
| Q-091 | Does `budget.slice` return as a total budget? | No change. The budget is `here` and `directions`. The name `slice` is an example, not a config key. | 2026-11-05 |
| Q-092 | What does the last line of `<directions>` hold, and when is a scope archived? | No archived state. The line is an example. | 2026-11-05 |
| Q-010 | What is the form of the map of directions, and what is its size limit? | The `<memory>` block with the policy text, `<directions>`, and `<here>`. The budgets `here` and `directions` give the limits. | 2026-11-05 |
| Q-013 | What input and what output does `memory_review` have? | The input holds `scope`, `reviewed`, and `reviewIn`. The answer gives the due records, then the count and the next date. See REQ-340 to REQ-344. | 2026-11-05 |
| Q-017 | Who sets `review_at`, and what is the review queue? | The write sets `review_at` from `reviewIn`, and the `review` event sets it too. The queue is the due answer of `memory_review`. | 2026-11-05 |
| Q-022 | What is the form of the line about a subagent write in the parent report? | One line for each proposal: the tag `[memory proposals from <session id>]`, the `addr`, and the `body`. See REQ-359. | 2026-11-05 |
| Q-023 | Is `longform` available by address, in the slice, or in both? | The tool `memory_open` gives the `longform` with `head` or `all`. The slice holds no `longform`. | 2026-11-05 |
| Q-093 | Does a `body` above 512 bytes give `LineTooLong`, or does the text above the limit move into `longform`? | The text above the limit moves into the `longform`. Q-027 gives the rule of the move. | 2026-11-05 |
| Q-094 | Does `memory_note` take `reviewIn`? | Yes. The write takes `reviewIn`, and REQ-245 is `rejected`. | 2026-11-05 |
| Q-095 | Which review period does each `kind` give? | 365 days for `decision`, `preference`, and `note`. 180 days for `fact`. 7 days for `task`. | 2026-11-05 |
| Q-096 | Does `memory_forget` take `targets` and `scope`, or `target` only? | The field is `targets`. A `pos` target needs `scope`, and an `addr` target needs none. | 2026-11-05 |
| Q-098 | Does `memory_note` take `idem`, or does the store set it? | The tool call makes `idem`. The agent gives no value. | 2026-11-05 |
| Q-099 | Is the default write scope the active scope or the `default` key of `[scope_default]`? | The active scope of the session. | 2026-11-05 |
| Q-100 | Does the filter of `memory_find` keep the name `due`? | The filter keeps `due`. It has no relation to the priority of the fold. | 2026-11-05 |
| Q-027 | Which rule moves the excess into `longform`: a cut at a word boundary, or the tail as it is? Does the tool make the move, or the model? | The write mechanism cuts the text mechanically at a word boundary and moves the rest into the `longform`. | 2026-11-05 |
| Q-097 | Which field of the `memory_forget` answer holds a proposal? | The answer gives `hidden: 0`. The proposal stays invisible to the agent. | 2026-11-05 |
| Q-030 | How does a merge join a sanitized event and a full event with one `id`? | The events of a record with a `redact` go in the sanitized form, in each order. See REQ-384. | 2026-11-05 |
| Q-019 | What is the export and import format, and how does `redact` block a restore? | Markdown is export-only. JSONL transfers store events. Scope keys map to encoded flat filenames. | 2026-11-05 |
| Q-102 | What does `memlens import --from dsh-sessions` read, and what records does it write? | The compaction reads each session and writes new notes into the store. See REQ-413. | 2026-11-05 |
| Q-103 | Does the text of `memlens describe` set the `title` or the `description`? | The CLI has no `describe` command. The tool `memory_scope` lists the scopes only. See Q-117. | 2026-11-05 |
| Q-104 | Must the target of `--into` be one of the two stores of `memlens merge`? | The CLI has no `merge` command. The import makes the merge. | 2026-11-05 |
| Q-105 | What does the directory of `--out` hold for each format? | An export takes the optional `--scope`. With no flag it writes one file for each scope, and with the flag one scope. | 2026-11-05 |
| Q-101 | Is an import joined by `id` or by `idem`? | The import and the merge join by `id`, and the key `idem` guards a repeated write. The two rules hold together. | 2026-11-05 |
| Q-106 | Which screens does the tab `Memory` hold? | The tab holds each screen. It has no catalog of profiles, because the profile of the session is current. | 2026-11-05 |
| Q-107 | Does the tab write, or does it read only? | The tab is a piece of the UI. A human does each action there, as in the full console. | 2026-11-05 |
| Q-004 | What does "localization" include: the product interface, the documents, or both? | The product interface, the READMEs, and the installation and usage instructions. | 2026-11-05 |
| Q-005 | Which DSH version does the plugin support? | DeepSeek Harness 0.2.2-rc.3 and later. See REQ-427. | 2026-11-05 |
| Q-006 | Does the plugin use the library? | The plugin uses the functions of the core library. | 2026-11-05 |
| Q-007 | Which license does the project use? | MIT. | 2026-11-05 |
| Q-008 | Which languages does the plugin package README take? | The README of the plugin package takes the eight languages of the DSH set. See Q-108. | 2026-11-05 |
| Q-024 | Does the console live in the CLI package or in its own package, and which stack does it use? | The UI core is in the core library, and the CLI package hosts the full console. The plugin uses the components of the harness UI, and no package stands alone. | 2026-11-05 |
| Q-026 | Which retry limit and which length ratio do the compaction and the card build use? | A merge makes three attempts at most with a request of 0.75 times the target, and the answer is the shortest. See REQ-436. | 2026-11-05 |
| Q-021 | What is the retelling prompt of the tree, and of the card? | The merge takes its system prompt and its task text, and the card takes its task text. See 09-prompts.md. | 2026-11-05 |
| Q-108 | Which two languages join the three of the project? | The eight languages of the DSH set: `de`, `en`, `es`, `fr`, `ja`, `pt`, `ru`, and `zh`. | 2026-11-05 |
| Q-110 | Is the budget of the slice one total of 24 KiB with three parts, or two independent budgets? | The profile gives two budgets, `here` and `directions`, and no total. The budgets count lines. The fallback profile gives 20 lines and 10 lines. | 2026-11-05 |
| Q-014 | Which surface does the session mode of the console use in the harness? | The tab mounts in the slot `conversation.session.header`, and the kind is `memlens`. See REQ-446. | 2026-11-05 |
| Q-015 | Which operations does the index port have? | The port gives the `pos` and the line of each hit. The index shares no transaction with the log. The tokenizer follows `language`. The rest is in [0003 Store](./adr/0003-store.md). | 2026-11-05 |
| Q-111 | Is `pos` the ordinal in the store, or the ordinal in the scope? | The ordinal in the scope. See Q-082. | 2026-11-05 |
| Q-112 | Does the budget `here` limit the tree of the current project, or the tree of the active scope? | The active scope of the session. The `[scope_default]` rules select the scope, and the tree follows it. See Q-047. | 2026-11-05 |
| Q-113 | Does the slice stay the same for the whole session, or does a trigger replace the text inside the session? | The text changes at a compaction and at an idle time above the TTL. A turn, a write, and a process restart change no text. The plugin gives the text. | 2026-11-05 |
| Q-114 | Does an import join the events by `id` or by `idem`? | The events join by `id`. The key `idem` stops a repeated write of one tool call. See Q-101. | 2026-11-05 |
| Q-116 | Does the product localize eight languages, or English, Russian, and Chinese? | The eight languages of the DSH set: `de`, `en`, `es`, `fr`, `ja`, `pt`, `ru`, and `zh`. See Q-108. | 2026-11-05 |
| Q-117 | Where does the store keep the `title` and the `description` of a scope? | None. A scope has a name only. The first node of the scope gives the text. See Q-044. | 2026-11-05 |
| Q-118 | Does a `redact` rewrite the target `note` event, or does it keep the event and remove the old bytes? | Closed by the storage pivot: no event exists. A redact is one transaction, and the row takes `deleted` with an empty body. See the [notes contract](././packages/core/src/store/notes.ts). | 2026-11-05 |
| Q-115 | Does the card render in `<directions>` or in `<here>`? | The card is the direction line. `<here>` holds no card line. | 2026-11-05 |
| Q-456 | What does the policy text of the slice hold? | The research of the prior art gives the text. The first form was the block of . See [REQ-509](02-requirements.md). | 2026-11-06 |
| Q-457 | How does a proposal change an existing record? | An ordinary write operation can carry proposed true. Approval applies the ordinary operation and closes the proposal with dismiss. | 2026-11-06 |
| Q-458 | What happens to one `id` with two payloads at one `at`? | Closed by the storage pivot: no payload hash exists. A merge compares five channels by version, by lifecycle rank, and by the cleared latch. See the [transfer contract](././packages/core/src/store/transfer.ts). | 2026-11-06 |
| Q-459 | When does the index show a note that a write just added? | The index row changes in the same transaction as the note row. A read after the commit sees the note. See the [notes contract](././packages/core/src/store/notes.ts). | 2026-11-06 |
| Q-460 | Which tokenizer does the index take for each language? | One value of `language` for the installation. `porter unicode61 remove_diacritics 1` for `en`, `unicode61 remove_diacritics 1` for the other languages with spaces, and `trigram` for `zh` and `ja`. See [REQ-450](02-requirements.md). | 2026-11-06 |
| Q-510 | Does a range with one non-empty child build a node? | Yes. A child without a longform copies without a model call. A leaf with a longform gives the full text to the model. The console shows the range line only. See [REQ-516](02-requirements.md). | 2026-11-11 |
| Q-511 | Does a direction line of an unready scope hold its period? | No period of timestamps. The range renders a temporary line with the keys and the age, and it needs no model call. The summary replaces that text when the node is ready. See [REQ-451](02-superseded.md). | 2026-11-11 |
| Q-512 | What does a direction line hold? | The keys, the idle time, and the summary. A line above one scope joins its keys and gives the range of the idle times. The line holds no count, no active marker, and no profile name. An unready range gives a temporary line with the keys and the age. The earlier form gave the count and the `active` marker. See [REQ-451](02-superseded.md). | 2026-11-11 |
| Q-513 | What text does a line of a dirty range hold? | The text of its two children, joined with a semicolon and a space, and cut at the line limit at a word boundary. A record gives its body and then its longform. The render assembles the text and stores nothing. The earlier form held no text and the period only. See [REQ-337](02-superseded.md). | 2026-11-11 |
| Q-518 | Which form keeps the scope menu usable with many scopes? | One flat list. No tree and no search field. The plugin menu holds three scopes today, so the list must serve a large count. See [REQ-565](02-requirements.md), and [REQ-566](02-requirements.md). | 2026-11-15 |
| Q-519 | Does the configuration keep the scope rules of `[scope_default]`? | The source list gives the default behavior. A rule of the user config comes before it. See [REQ-555](02-requirements.md), and [REQ-564](02-requirements.md). | 2026-11-15 |
| Q-520 | When does a change of the base file apply? | A file watch. A change of the base file applies with no harness restart. See [REQ-548](02-requirements.md). | 2026-11-15 |
| Q-521 | Does the preset keep the mandatory `profile` key? | The default value of the key `profile` is `default`. See [REQ-547](02-requirements.md). | 2026-11-15 |
| Q-522 | What happens when the active scope is not a scope of the profile? | The customer selected option A: the active scope joins the scopes of that session. The join adds the literal key at each configuration read and writes no configuration file. See [REQ-563](02-requirements.md). | 2026-11-15 |
| Q-524 | Does the key `batch` stay now that one call carries one batch? | The customer selected option A with the corrected count. The key stays, the default is ten, and the key sets no upper limit. See [REQ-572](02-requirements.md), [REQ-576](02-requirements.md), and [0023 Batch compaction](./adr/0023-batch-compaction.md). | 2026-11-16 |
| Q-525 | Which status does the removed key `compaction.mode` have? | The customer selected option B. The plugin keeps no compatibility form, and the load rejects the key `mode` as an unknown key. See [REQ-575](02-requirements.md) and [0023 Batch compaction](./adr/0023-batch-compaction.md). | 2026-11-16 |
