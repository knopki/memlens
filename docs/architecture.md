# Architecture

memlens is the long-term memory of an agent. One SQLite database holds the memory as rows. A tree
of summary rows stands above the notes, and the agent reads a slice of that tree at the start of a
session. The LikeC4 model in [docs/arch](arch/README.md) shows the parts, the use cases, and the
deployment as diagrams.

## The objects

A **profile** is a set of scopes with a line budget. A **scope** is a key of the form `kind:name`,
lowercase, for example `project:knopki/memlens`. The store lowercases the key before a write.

A **note** is one curated fact: a `body` of 384 characters, and a `longform` document of up to
16 384 characters. The body becomes a leaf of the tree. The longform stays out of the tree and
arrives only through `memory_open`.

A **slot** is the position of a note in its scope. A **node** is one summary row over an aligned
range of slots. A **slice** is the rendered view of the tree: the `<memory>` section of the agent
prompt. The glossary holds the terms.

## Storage

One database file `memlens.db` holds the tables `notes`, `nodes`, `proposals`, `meta`, and
`journal`, and the FTS5 search index. Current rows are the truth. There is no event log and no
replay.

An open reads the schema version from `meta`. A store behind the build migrates the tables in one
transaction, and it keeps each note row and each slot. A failed migration keeps the earlier schema
and the earlier data. The open refuses a version above the build, a version below the earliest
schema, an absent version, and an invalid version.

Each write runs in one transaction and keeps the note rows, the index rows, the node rows, and the
journal row in step. The node cache is valid only while the keys of its children match the current
rows. A change deletes each node row over the changed slot in the same transaction, so a stale
summary cannot survive a write. The index is a cache: the store rebuilds it after a loss, and
`memlens repair` rebuilds damaged cache rows.

The journal holds no content and no hash. No state path reads it.

The store path comes from `--store`, then the plugin patch, then `MEMLENS_STORE`, then the base
config file. See [configuration.md](configuration.md).

## Order and addresses

A note keeps the immutable key `(ts, id)`, and its slot is the rank of that key among the note rows
of its scope. A write of a past moment lands before the notes of a later moment. An insert in the middle
shifts the later slots by one. A numeric address is not stable in time.

The `id` is a ULID, and it is the only cross-store identity.

An address is `pos` or `scope#pos`. An `addr` from a tool answer holds the scope, so the agent need
not remember one.

A hidden note keeps its slot and its content, and it leaves the view. A redacted note keeps its
row as a tombstone with no content. The redact clears the body, the longform, the index row, the
covering node rows, and the proposals that name the note in one transaction.

## The tree

The leaves are the notes of a scope. A node stands above an aligned range of slots, one node row
for each range. The tree has a frontier: levels of a fixed width, and one level covers 2^k leaves.
The frontier lists the lines from the oldest to the newest, the coarse lines first and the fresh
notes last.

A range without a valid node renders a temporary line assembled from its two children. That line
appears at once, calls no model, and waits for no compaction. The directions line of an unready
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

The slice is one `<memory>` section with three parts: `<how-to>`, `<directions>`, and `<here>`. The
`<how-to>` part holds the policy text and the value of `customPromptAppend`. The `customPrompt` key
replaces the whole template, and the placeholders apply in it.

The `<directions>` part holds one line for each of the newest scopes of the profile, from the oldest
to the newest, within the directions budget. A line has the form `[<key>] <age> <summary>`. The text
is the summary of the top node of the scope. Every scope older than the budget becomes one comma
list of keys with no description. A scope with no live note gives no line.

The `<here>` part holds the frontier of the active scope. A leaf line has the form
`#<pos> <YYYY-MM-DD> <body>`, and a range line has the form `#<a>-<b> <start>..<end> <summary>`,
with the shared year and month written once.

A part above its budget merges one pair at a time and stops as soon as the count of lines fits. The
parent line takes the place of the two lines of the pair. Among the pairs, the merge minimizes the
jump penalty first, then the review date, the level, and the start. The pair that covers the
greatest live position never merges, so a slice ends with its last live record. A pair merges even
when the node of its range is not built, and the temporary line takes the place of the two lines.
When no pair merges and the part is still above its budget, the oldest lines leave the part.

The plugin registers the slice as runtime context with `required: true` and the order 220, after the
built-in contexts. The harness writes the text as a user-role message after the saved history, and
it writes a new message only when the text changes. The text stays the same through the turns of a
session and through the writes of that session. A session start and a successful compaction give a
new snapshot, and a process restart gives the same text.

When the store cannot open, the session continues and the console reports that memory is unavailable.
A session without a saved section gets no memory context until the store opens. The memory tools
answer errors. The plugin retries the open and connects the live sessions when the store becomes available.

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

The profile mode selects the set of a subagent. The mode `propose` gives the child `memory_find`,
`memory_open`, `memory_note`, and `memory_map`. The mode `read` gives the reading tools only, and
the mode `off` gives no memory tool and no slice.

A target outside the scopes of the profile gives the error `NotAllowed`. A `forget` outside the
scopes writes a proposal instead. Only the CLI and the console amend, redact, accept, and dismiss. The store
dismisses an expired proposal with no human.

## Proposals

A subagent writes with `proposed: true`. The store holds one proposal row with a payload and an
expiry of 30 days. The answer names the proposal id under the session of the child. The parent
report lists the proposals of its children with their ids and bodies. The parent applies a
suggestion through an ordinary write, and the console applies the stored operation and dismisses the
proposal in one transaction.

## The consoles

One browser client serves two hosts: the standalone console of the CLI command `ui`, and the
surfaces of the plugin inside the harness GUI. The client holds the model, the store, the screens,
and the translations. The command `memlens ui` serves the built client over a local HTTP boundary.
The plugin mounts the console in the side panel and a session tab, and it narrows the tab to the
session scope.

A client stays in its own package and its own bundle. A file never mixes client code and backend
code.

## The CLI

The binary `memlens` runs without the harness and takes one command.

```text
memlens note "<body>" [--scope key] [--longform file.md] [--kind kind] [--supersedes 12,14] [--review 180d|never] [--ts iso]
memlens find "<words>" [--scope key]... [--since date] [--until date] [--due] [--limit 10] [--json]
memlens open <target> [--scope key] [--no-longform] [--offset N]
memlens forget <target> [--scope key] [--reason "text"]
memlens review [--scope key]... [--limit 50] [--json]
memlens review --mark <target>,<target> [--scope key] [--for 180d]
memlens redact <target> [--scope key] [--reason "text"] [--yes]
memlens amend <target> [--scope key] [--body "text"] [--longform file.md] [--kind kind] [--supersedes 12,14]
memlens scopes [--json]
memlens scope
memlens slice [--profile name] [--scope key] [--json]
memlens compact [--scope key] [--max 50] [--dry-run]
memlens compact --answer path
memlens status [--json]
memlens check [--json]
memlens repair [--dry-run]
memlens export --format md|jsonl --out dir [--scope key]
memlens import --in path [--as key] [--dry-run]
memlens config get|set key [value]
memlens ui [--port 7788] [--allow-delete]
```

The CLI selects the scope of a command from the first matching scope rule, then the Git repository
name, then the configured default.

The command `compact` gives the merge inputs of one scope as one job, and the flag `--answer`
applies one answer file after the store rechecks each input. The command `export` writes JSONL of
full note rows with a header and a trailer. Proposals, summaries, and slots never travel. The
command `import` merges by `id` with five channels. Content and review merge by version.
Lifecycle merges by maximum. Cleared merges by latch. The supersede link merges by the first
write. A repeated import changes no row.

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
| `memory_open`    | `head` 8 192, `all` 16 384 characters, and the answer continues with `offset`         |
| Node             | Target 512 characters, limit 640 characters, a cut with a flag                        |
| Input of a merge | Two children. At level 1 a leaf gives its body and its longform.                   |
| Budget           | The profile gives `here` and `directions` in lines                                    |
| Compaction       | `batch` 10, a whole number above zero, no upper limit, 120 calls in an hour           |
| Nudge            | `tool_calls` and `turns` 10                                                           |
| Review           | 365 days for `decision`, `preference`, `note`. 180 days for `fact` and `gotcha`. 7 for `task`. |
| GC of proposals  | 30 days                                                                               |
| `find`           | 10 records, and 50 for each scope                                                     |
| `cacheTtl`       | `deepseek/*` 2 hours, `anthropic/*` 5 minutes, another model 1 hour                    |
