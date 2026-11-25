# Architecture

memlens is the long-term memory of an agent. One SQLite database holds the memory as rows. A tree
of summary rows stands above the notes, and the agent reads the memory text at the start of a
session. The LikeC4 model in [docs/arch](arch/README.md) shows the parts, the use cases, and the
deployment as diagrams.

## The objects

A **profile** is a set of scopes with a line budget. A **scope** is a key of the form `kind:name`,
for example `project:knopki/memlens`. The kind takes lowercase letters, digits, periods, underscores,
slashes, and hyphens, and it starts with a letter or a digit. The name takes any text without
whitespace, control or format characters, `#`, commas, and brackets. The store lowercases the kind
before a write, and it keeps the case of the name. A key holds no fixed count of segments: the first
colon separates the kind from the name, and the name may hold a colon.

A **note** is one record of the memory: a `body` of 384 characters, and a `longform` document of up to
16 384 characters. The body becomes a leaf of the tree. The longform stays out of the tree and
arrives only through `memory_open`.

A **slot** is the position of a note in its scope, and a hidden or deleted note keeps its slot. A
**node** is one summary row over an aligned range of slots. A **slice** is the set of lines of the
tree. The **context text** is the rendered `<memory>` section of the agent prompt. The glossary
holds the terms.

## Storage

One database file `memlens.db` holds the tables `notes`, `nodes`, `proposals`, `meta`, and
`journal`, and the FTS5 search index. The rows are the truth, and the tree and the index are caches.
An open builds the index with the tokenizer of the `language` key when the stored tokenizer
differs.

An open reads the schema version from `meta`. A store behind the build migrates the tables in one
transaction, and it keeps each note row and each slot. A failed migration keeps the earlier schema
and the earlier data. The open refuses a version above the build, a version below the earliest
schema, an absent version, and an invalid version.

Each write runs in one transaction and keeps the note rows, the index rows, the node rows, and the
journal row in step. The node cache is valid only while the keys of its children match the current
rows. A change deletes each node row over the changed slot in the same transaction, so a stale
summary cannot survive a write. The command `memlens repair` drops the invalid node rows, rebuilds
the index on a drift, and prunes the journal.

The journal is an audit trail for a human. The command `memlens journal` prints its newest events.
It holds no content, and no state path reads it.

The store path comes from `--store`, then the plugin patch, then `MEMLENS_STORE`, then the base
config file, then the built-in defaults. An invalid or unreadable base file gives the built-in
defaults, and the console shows the error. A later valid file applies with no restart. See
[configuration.md](configuration.md).

## Order and addresses

A note keeps the immutable key `(ts, id)`, and its slot is the rank of that key among the note rows
of its scope. A write of a past moment lands before the notes of a later moment. An insert in the middle
shifts the later slots by one. A numeric address is not stable in time.

After a successful insert before the tail, `memory_note` appends one line to its answer:

```text
moved: notes #p..#q of {scope} are now #p+1..#q+1. Re-read with memory_map, or find a note with memory_find.
```

The values replace the placeholders. The old range starts at the new slot and ends one below the new maximum slot.
The tool reads `MAX(pos)` once after the insert, across all states of that scope.

The `id` is a ULID, and it is the only cross-store identity.

An address is `pos` or `scope#pos`. An `addr` from a tool answer holds the scope, so the agent need
not remember one.

A hidden note keeps its slot and its content, and it leaves the view. A redacted note keeps its
row as a tombstone with no content. The redaction clears the body, the longform, the index row, the
covering node rows, and the proposals that name the note in one transaction. The write-ahead log
keeps the earlier frames until the close truncates it.

## The tree

The leaves are the notes of a scope. A node stands above an aligned range of slots, one node row
for each range. The tree has a frontier: levels of a fixed width, and one level covers 2^k leaves.
The frontier lists the lines from the oldest to the newest, the coarse lines first and the fresh
notes last.

A range without a valid node renders a temporary line assembled from its two children. That line
appears at once, and it needs no model call and no compaction. The directions line of an unready
scope uses the same rule.

## Compaction

The compaction derives its candidates from the dirty non-empty ranges up to the root. A missing node
row is a dirty candidate. The store keeps no queue, no job row, and no lease. A restart derives the
candidates again, and the in-flight attempts stay in memory.

A pass sends one batch of ready merge inputs to the configured model. At level 1 each leaf child
gives its body and its complete longform. Above level 1 a child gives its summary. A join or a copy
needs no model call. The build applies it only when no child carries a longform and the content
fits the node limit.

A good line of the answer publishes its range at once. An absent line, an empty line, and a line
that is not shorter than its input leave their ranges open. The pass retries them in a batch of
half the size, down to one input. A range that no attempt builds stays dirty for the next pass.

Each attempt copies the exact child inputs and rechecks both current children under the write lock
before publication. A changed input, a hidden record, or a dirty child rejects the result.

A pass starts when the dirty candidates reach the batch count. It also starts when the store idle
time expires, at `memlens compact`, and ten seconds after plugin activation when work waits. The worker mirrors each
pass and each failure to the host log and to the console journal. A model call names its start, its
finish, its duration, and its text size, and never a note text. The journal keeps the last 100
events.

## The memory context

The context text is one `<memory>` section with three parts: `<how-to>`, `<directions>`, and
`<here>`. The
`<how-to>` part holds the policy text and the value of `customPromptAppend`. The `customPrompt` key
replaces the whole template, and the placeholders apply in it.

The `<directions>` part holds one line for each of the newest scopes of the profile, from the oldest
to the newest, within the directions budget. A scope ranks by the `ts` of its newest live note, and
the age is the idle time of that note. A line has the form `[<key>] <age> <summary>`. The text is
the summary of the top node of the scope. Every scope older than the budget becomes one comma list
of keys with no description. A scope with no live note gives no line.

The `<here>` part holds the frontier of the active scope. A leaf line has the form
`#<pos> <YYYY-MM-DD> <body>`, and a range line has the form `#<a>-<b> <start>..<end> <summary>`,
with the shared year and month written once.

A part above its budget merges one pair at a time and stops as soon as the count of lines fits. The
parent line takes the place of the two lines of the pair. Among the pairs, the merge minimizes the
jump penalty first, then `due`, the level, and the start. The pair that covers the
greatest live position never merges, so a slice ends with its last live record. A pair merges even
when the node of its range is not built, and the temporary line takes the place of the two lines.
When no pair merges and the part is still above its budget, the oldest lines leave the part.

The plugin registers the slice as runtime context with `required: true` and the order 220, after the
built-in contexts. The harness writes the text as a user-role message after the saved history, and
it writes a new message only when the text changes. The text stays the same through the turns of a
session and through the writes of that session. A session start and a successful compaction give a
new snapshot, and a process restart gives the same text.

When the store cannot open, the session continues, and the console reports that the memory is
unavailable. A session without a saved section gets no memory text until the store opens. The tools
answer errors. The plugin retries the open and connects the live sessions when the store becomes
available.

## The tools

The plugin registers the memory tools in the context of each agent.

| Tool            | Who                  | Effect                                                                 |
| --------------- | -------------------- | ---------------------------------------------------------------------- |
| `memory_note`   | main agent, subagent | Writes a note, or gives the live note with the same four fields.        |
| `memory_forget` | main agent           | Hides records, and makes the dependent summary ranges dirty.            |
| `memory_find`   | main agent, subagent | Gives the records with the matching words, each with its `addr`.        |
| `memory_open`   | main agent, subagent | Gives a record with its longform, or the two children of a node.        |
| `memory_review` | main agent           | Gives the due records, or marks the reviewed records.                   |
| `memory_map`    | main agent, subagent | Gives the visible scopes, or the tree slice of one scope.               |

A write carries the time of the note, and the write time is the default. The store ranks the note by
that time.

The answers of `memory_forget` and `memory_note` with `supersedes` echo each target: address, note day, kind, and body.
The echo uses the target rows that the tool already reads. A proposed forget identifies its action as a proposal.

The store keeps each time in UTC. A write reads a day alone as the start of that day in the zone of
the process. A day in a view is the day of that time in that zone, and a tool answer gives that day.
A date-only `since` or `until` of a find covers that whole day.

The profile mode selects the set of a subagent. The mode `propose` gives the child `memory_find`,
`memory_open`, `memory_note`, and `memory_map`. The mode `read` gives the reading tools only, and
the mode `off` gives no memory tool and no slice.

A target outside the scopes of the profile gives the error `NotAllowed`. A `forget` outside the
scopes writes a proposal instead. Only the CLI and the console amend, redact, accept, and dismiss. The store
dismisses an expired proposal with no human.

## Proposals

A subagent writes one proposal row with a payload and an expiry of 30 days. The answer names the
proposal id under the session of the child. The parent
report lists the proposals of its children with their ids and bodies. A human accepts or dismisses a
proposal in the console. The parent applies a
suggestion through an ordinary write, and the console applies the stored operation and dismisses the
proposal in one transaction.

## The consoles

One browser client serves two hosts: the standalone console of the CLI command `ui`, and the
surfaces of the plugin inside the harness GUI. The client holds the model, the store, the screens,
and the translations. The command `memlens ui` serves the built client over a local HTTP boundary.
The plugin mounts the console in the side panel and a session tab, and it narrows the tab to the
session scope.

One backend module in `@memlens/core` holds the edit rules and the read rules of the console, so
both hosts apply one rule set.

The domain applies the profile rules and assembles each console answer. The store owns SQL and selects the required rows and columns.
Each console request reads the data of one screen. No console read assembles a full memory snapshot.

A client stays in its own package and its own bundle. A file never mixes client code and backend
code.

## The CLI

The binary `memlens` runs without the harness and takes one command.

```text
memlens note "<body>" [--scope key] [--longform file.md] [--kind kind] [--supersedes 12,14] [--review 180d|never] [--ts iso]
memlens find "<words>" [--scope key]... [--since date] [--until date] [--due] [--limit 10] [--json]
memlens open <target> [--scope key] [--no-longform] [--json]
memlens forget <target> [--scope key] [--reason "text"]
memlens restore <target> [--scope key] [--reason "text"]
memlens review [--scope key]... [--limit 50] [--json]
memlens review --mark <target>,<target> [--scope key] [--for 180d]
memlens redact <target> [--scope key] [--reason "text"] [--yes]
memlens amend <target> [--scope key] [--body "text"] [--longform file.md] [--kind kind] [--supersedes 12,14]
memlens move <src> <dst> [--dry-run]
memlens scopes [--json]
memlens scope
memlens slice [--profile name] [--scope key] [--json]
memlens compact [--scope key] [--max 50] [--dry-run]
memlens compact --answer path
memlens status [--json]
memlens check [--json]
memlens repair [--dry-run]
memlens journal [--limit 20] [--scope key] [--json]
memlens export --format md|jsonl --out dir [--scope key]
memlens import --in path [--as key] [--dry-run]
memlens config show [--profile name] [--json]
memlens ui [--port 7788] [--allow-delete]
```

The CLI selects the scope of a command from the first matching scope rule, then the Git repository
name, then the configured default.

Only the CLI exposes `restore`: it returns a hidden note to `live` and bypasses the profile scope list.
The slot stays fixed. One transaction restores FTS, deletes the covering nodes, and journals `restore` with a reason.
The default reason is `cli restore`. A target in any other state gives a `Data` error.

The command `move` moves all note rows with content from one scope to another in one transaction.
Hidden and deleted rows with content move too, and each row keeps its state and `id`.
Each moved row takes its destination slot from `(ts, id)`.
The write updates `modified_at`, `v`, and `v_content`, deletes the affected nodes, and records one journal entry with op `move` per note.

Cleared rows stay in the source, and the command reports each source address.
The command reports the moved count and both scopes.
The flag `--dry-run` reports the counts and the cleared addresses without a write.
Equal source and destination scopes give a moved count of zero without a write.

The command `compact` gives the merge inputs of one scope as one job, and the flag `--answer`
applies one answer file after the store rechecks each input. The command `export` writes JSONL of
full note rows with a header. Proposals, summaries, and slots never travel. The
command `import` merges by `id`, by channel. Content and review merge by version.
Lifecycle merges by maximum. Cleared merges by latch. The supersede link merges by the first
write. A repeated import changes no
row.

## Errors

An error carries a code and a message, and the exit code follows the kind.

| Code                  | Kind   | Exit code | When                                            |
| --------------------- | ------ | --------- | ----------------------------------------------- |
| `NotAllowed`          | policy | 3         | A target outside the profile of `scopes`         |
| `CrossScopeSupersede` | data   | 1         | A `supersedes` of a record of another scope      |
| `Usage`               | usage  | 2         | A flag outside the usage, or no command          |
| `Data`                | data   | 1         | An unknown target, or a payload that does not fit |

## Limits

| Item             | Value                                                                                |
| ---------------- | ------------------------------------------------------------------------------------ |
| `body`           | 384 characters required, 512 characters accepted                                     |
| `longform`       | 16 384 characters                                                                    |
| `memory_open`    | The longform: 2 048 characters for `head`, 16 384 for `all`, and the answer continues with `offset` |
| Node             | Target 512 characters, limit 640 characters, a cut with a flag                        |
| Input of a merge | Two children. At level 1 a leaf gives its body and its longform.                   |
| Budget           | The profile gives `here` and `directions` in lines                                    |
| Compaction       | `batch` 10, a whole number above zero, no upper limit, 120 calls in an hour           |
| Nudge            | `tool_calls` and `turns` 10                                                           |
| GC of proposals  | 30 days                                                                               |
| `find`           | 10 records, and 50 for each scope                                                     |
