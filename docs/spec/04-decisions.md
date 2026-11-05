# Decision log

The index of the decisions. The reason for each decision is in the ADR of its area. See
[../adr/](../adr/).

| ID | Date | Decision | Status | ADR |
| --- | --- | --- | --- | --- |
| D-001 | 2026-11-04 | The specification is a set of markdown files in `docs/spec/` with a statement journal in… | accepted | [0001](../adr/0001-spec-process.md) |
| D-002 | 2026-11-04 | Each statement goes to the journal first, word for word. | accepted | [0001](../adr/0001-spec-process.md) |
| D-003 | 2026-11-04 | All documents and code comments use ASD-STE100 Simplified Technical English. | accepted | [0001](../adr/0001-spec-process.md) |
| D-004 | 2026-11-04 | The specification stays `draft` until the customer accepts an item. | accepted | [0001](../adr/0001-spec-process.md) |
| D-005 | 2026-11-04 | The stack is TypeScript on Node.js with pnpm workspaces. | accepted | [0002](../adr/0002-stack-build.md) |
| D-006 | 2026-11-04 | Each package has a README in the eight languages of the DSH set. | accepted | [0002](../adr/0002-stack-build.md) |
| D-007 | 2026-11-04 | The scaffold uses the DSH plugin contract from the `dsh-plugin-guide` template. | accepted | [0002](../adr/0002-stack-build.md) |
| D-008 | 2026-11-04 | Tool versions come from `mise.toml` as release lines: node 24, pnpm 12, and python 3.14. | accepted | [0002](../adr/0002-stack-build.md) |
| D-009 | 2026-11-04 | The project keeps the check tools in `scripts/vendor/`: the STE linter under MIT and the DSH… | accepted | [0001](../adr/0001-spec-process.md) |
| D-010 | 2026-11-04 | The plugin manifest gets a test in `packages/dsh-plugin/tests/manifest.test.ts`, not a vendored… | accepted | [0001](../adr/0001-spec-process.md) |
| D-011 | 2026-11-04 | The project builds with TypeScript 7, the native compiler. | accepted | [0002](../adr/0002-stack-build.md) |
| D-012 | 2026-11-04 | A tool that the packages run comes from npm as a dev dependency, so the lockfile pins it. | accepted | [0002](../adr/0002-stack-build.md) |
| D-013 | 2026-11-04 | The memory is a log of curated notes with a tree of retellings above them. | accepted | [0005](../adr/0005-tree-writer.md) |
| D-014 | 2026-11-04 | The store has two backends of equal rank: sqlite and jsonl. | accepted | [0004](../adr/0004-store.md) |
| D-015 | 2026-11-04 | The tree is a cache over the notes. | replaced | [0008](../adr/0008-slice-context.md) |
| D-016 | 2026-11-04 | A merge is a union of events by id. | accepted | [0004](../adr/0004-store.md) |
| D-017 | 2026-11-04 | The plugin package has two entry points: `.` and `./preset`. | replaced | [0007](../adr/0007-scope-config.md) |
| D-018 | 2026-11-04 | The project takes these parts of the prior art. | accepted | [0005](../adr/0005-tree-writer.md) |
| D-019 | 2026-11-04 | The writer defaults follow the measurements. | replaced | [0005](../adr/0005-tree-writer.md) |
| D-020 | 2026-11-04 | The log holds events, and a `redact` clears the content of its target. | accepted | [0003](../adr/0003-event-log.md) |
| D-021 | 2026-11-04 | `pos` is not a field of an event. | accepted | [0003](../adr/0003-event-log.md) |
| D-022 | 2026-11-04 | A catalog card is a `note` event with `kind: "card"`, `for_scope`, and `for_sources`. | accepted | [0006](../adr/0006-catalog.md) |
| D-023 | 2026-11-04 | A `supersedes` stays inside one scope. | accepted | [0003](../adr/0003-event-log.md) |
| D-024 | 2026-11-04 | An event has two times. | accepted | [0003](../adr/0003-event-log.md) |
| D-025 | 2026-11-04 | The note event holds `review_at` only, the date of the next review. | accepted | [0003](../adr/0003-event-log.md) |
| D-026 | 2026-11-04 | The prior-art table gives the principles, not the field names. | accepted | [0003](../adr/0003-event-log.md) |
| D-027 | 2026-11-04 | A `target` field names the `note` event. | accepted | [0003](../adr/0003-event-log.md) |
| D-028 | 2026-11-04 | The projection is deterministic over the order `(at, id)`, and it makes two passes: one for the… | accepted | [0003](../adr/0003-event-log.md) |
| D-029 | 2026-11-04 | The supersede is irreversible. | accepted | [0003](../adr/0003-event-log.md) |
| D-030 | 2026-11-04 | A `redact` event clears the content of a record for good, and a later `amend` changes no content… | accepted | [0009](../adr/0009-redaction.md) |
| D-031 | 2026-11-04 | The state order is `live`, `hidden`, `proposed`, `deleted`. | accepted | [0003](../adr/0003-event-log.md) |
| D-032 | 2026-11-04 | An `accept` event clears the effect of an earlier `hide` event. | accepted | [0003](../adr/0003-event-log.md) |
| D-033 | 2026-11-04 | A rebuild of a card writes a new `note` event with the old card in `supersedes`. | accepted | [0006](../adr/0006-catalog.md) |
| D-034 | 2026-11-04 | The catalog has one scope for each profile: `__catalog__:<profile>`. | accepted | [0006](../adr/0006-catalog.md) |
| D-035 | 2026-11-04 | A card becomes dirty after a change of a source, and the store rebuilds it from the live records… | accepted | [0006](../adr/0006-catalog.md) |
| D-036 | 2026-11-04 | The model has no `scrub` step. | accepted | [0009](../adr/0009-redaction.md) |
| D-037 | 2026-11-04 | A card carries `body`, `kind`, `ts`, `session`, `for_scope`, and `for_sources`, and no… | accepted | [0006](../adr/0006-catalog.md) |
| D-038 | 2026-11-04 | A node has the key `(level, start)`, and a node of level `L` covers `2^L` consecutive `pos`… | accepted | [0005](../adr/0005-tree-writer.md) |
| D-039 | 2026-11-04 | A summary line targets 512 bytes and stops at 640 bytes. | accepted | [0005](../adr/0005-tree-writer.md) |
| D-040 | 2026-11-04 | The frontier lists the lines from the oldest to the newest. | accepted | [0005](../adr/0005-tree-writer.md) |
| D-041 | 2026-11-04 | The rebuild follows the dirty marks. | accepted | [0005](../adr/0005-tree-writer.md) |
| D-042 | 2026-11-04 | The project does not adopt the scope registry. | accepted | [0007](../adr/0007-scope-config.md) |
| D-043 | 2026-11-04 | A wrong key of a scope changes by an `amend` of the record. | accepted | [0007](../adr/0007-scope-config.md) |
| D-044 | 2026-11-04 | An `amend` moves a record to the key in its `scope` field, and it does so for a record with… | accepted | [0007](../adr/0007-scope-config.md) |
| D-045 | 2026-11-04 | The configuration is a TOML file with a `store` section and one `[profile.<name>]` section for… | accepted | [0007](../adr/0007-scope-config.md) |
| D-046 | 2026-11-04 | The configuration sets no total budget. | accepted | [0007](../adr/0007-scope-config.md) |
| D-047 | 2026-11-04 | The subagent mode sets the access of a subagent. | accepted | [0007](../adr/0007-scope-config.md) |
| D-048 | 2026-11-04 | The fold takes a pair by `due` in descending order, then `level` in ascending order, then… | accepted | [0005](../adr/0005-tree-writer.md) |
| D-049 | 2026-11-04 | `storeRev` is a counter that grows in the transaction of each edit in SQLite, and a fingerprint… | accepted | [0004](../adr/0004-store.md) |
| D-050 | 2026-11-04 | The store of memlens holds no snapshot. | accepted | [0008](../adr/0008-slice-context.md) |
| D-051 | 2026-11-04 | The snapshot is a cache of the plugin. | accepted | [0008](../adr/0008-slice-context.md) |
| D-052 | 2026-11-04 | The plugin reads the text of the last snapshot from the session history and gives that text at… | accepted | [0008](../adr/0008-slice-context.md) |
| D-053 | 2026-11-04 | The body of the card is the answer of the model, and the limit is 512 bytes. | accepted | [0006](../adr/0006-catalog.md) |
| D-054 | 2026-11-04 | The compaction runs outside the agent loop. | accepted | [0005](../adr/0005-tree-writer.md) |
| D-055 | 2026-11-04 | A `redact` runs in one transaction. | accepted | [0009](../adr/0009-redaction.md) |
| D-056 | 2026-11-04 | The compression works on `<directions>` first, then on `<here>`, and it cuts no policy text. | accepted | [0008](../adr/0008-slice-context.md) |
| D-057 | 2026-11-04 | The nudge is one line after the frozen slice, so the cached prefix stays put. | accepted | [0008](../adr/0008-slice-context.md) |
| D-058 | 2026-11-04 | The default text of the nudge names no unit: `[memory] {n} steps since the last record. | accepted | [0008](../adr/0008-slice-context.md) |
| D-059 | 2026-11-04 | A merge gives the model the two children only. | accepted | [0005](../adr/0005-tree-writer.md) |
| D-060 | 2026-11-04 | A scope key has the form `kind:name`. | accepted | [0007](../adr/0007-scope-config.md) |
| D-061 | 2026-11-04 | The scope grammar covers the keys that the agent sees. | accepted | [0007](../adr/0007-scope-config.md) |
| D-062 | 2026-11-04 | The `pos` of an address is the ordinal in the scope. | accepted | [0007](../adr/0007-scope-config.md) |
| D-063 | 2026-11-04 | The part `*` of a scope key stands in the kind or in the name, and it matches any text of that part. | accepted | [0007](../adr/0007-scope-config.md) |
| D-064 | 2026-11-04 | The slice goes to `systemPrompt.context`, not to a system prompt section. | accepted | [0008](../adr/0008-slice-context.md) |
| D-065 | 2026-11-04 | The plugin config is a deep merge of three layers: the memlens TOML file, the profile patch in… | accepted | [0007](../adr/0007-scope-config.md) |
| D-066 | 2026-11-04 | The agent surface is `memory_find`, `memory_open`, `memory_note`, and `memory_forget`. | replaced | [0008](../adr/0008-slice-context.md) |
| D-067 | 2026-11-04 | The writer takes the provider of the model route when `provider` is empty. | accepted | [0005](../adr/0005-tree-writer.md) |
| D-068 | 2026-11-05 | The descent of `memory_open` stops at a working budget of 4096 visited nodes and at an answer of… | accepted | [0008](../adr/0008-slice-context.md) |
| D-069 | 2026-11-05 | A subagent write is always `proposed`. | accepted | [0008](../adr/0008-slice-context.md) |
| D-070 | 2026-11-05 | The agent surface is `memory_find`, `memory_open`, `memory_note`, `memory_forget`,… | accepted | [0008](../adr/0008-slice-context.md) |
| D-071 | 2026-11-05 | The default export copies the whole store under an exclusive lock. | accepted | [0004](../adr/0004-store.md) |
| D-072 | 2026-11-05 | The index port takes the query after the parse: the words, the words with `-`, the scopes, the… | accepted | [0004](../adr/0004-store.md) |
