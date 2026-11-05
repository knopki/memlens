# Decision log

The index of the decisions. The reason for each decision is in its ADR. See [../adr/](../adr/).

| ID | Date | Decision | Status | ADR |
| --- | --- | --- | --- | --- |
| D-001 | 2026-11-04 | The specification is a set of markdown files in `docs/spec/` with a statement journal in… | accepted | [0001](../adr/0001-spec-files.md) |
| D-002 | 2026-11-04 | Each statement goes to the journal first, word for word. | accepted | [0002](../adr/0002-statement-journal.md) |
| D-003 | 2026-11-04 | All documents and code comments use ASD-STE100 Simplified Technical English. | accepted | [0003](../adr/0003-ste-documents.md) |
| D-004 | 2026-11-04 | The specification stays `draft` until the customer accepts an item. | accepted | [0004](../adr/0004-draft-gate.md) |
| D-005 | 2026-11-04 | The stack is TypeScript on Node.js with pnpm workspaces. | accepted | [0005](../adr/0005-stack.md) |
| D-006 | 2026-11-04 | Each package has a README in the eight languages of the DSH set. | accepted | [0006](../adr/0006-readme-languages.md) |
| D-007 | 2026-11-04 | The scaffold uses the DSH plugin contract from the `dsh-plugin-guide` template. | accepted | [0007](../adr/0007-plugin-scaffold.md) |
| D-008 | 2026-11-04 | Tool versions come from `mise.toml` as release lines: node 24, pnpm 12, and python 3.14. | accepted | [0008](../adr/0008-tool-versions.md) |
| D-009 | 2026-11-04 | The project keeps the check tools in `scripts/vendor/`: the STE linter under MIT and the DSH… | accepted | [0009](../adr/0009-vendored-checks.md) |
| D-010 | 2026-11-04 | The plugin manifest gets a test in `packages/dsh-plugin/tests/manifest.test.ts`, not a vendored… | accepted | [0010](../adr/0010-manifest-test.md) |
| D-011 | 2026-11-04 | The project builds with TypeScript 7, the native compiler. | accepted | [0011](../adr/0011-build-tools.md) |
| D-012 | 2026-11-04 | A tool that the packages run comes from npm as a dev dependency, so the lockfile pins it. | accepted | [0012](../adr/0012-dev-dependencies.md) |
| D-013 | 2026-11-04 | The memory is a log of curated notes with a tree of retellings above them. | accepted | [0013](../adr/0013-memory-shape.md) |
| D-014 | 2026-11-04 | The store has two backends of equal rank: sqlite and jsonl. | accepted | [0014](../adr/0014-store-backends.md) |
| D-015 | 2026-11-04 | The tree is a cache over the notes. | replaced | [0015](../adr/0015-tree-cache.md) |
| D-016 | 2026-11-04 | A merge is a union of events by id. | accepted | [0016](../adr/0016-event-union.md) |
| D-017 | 2026-11-04 | The plugin package has two entry points: `.` and `./preset`. | replaced | [0017](../adr/0017-preset-entry.md) |
| D-018 | 2026-11-04 | The project takes these parts of the prior art. | accepted | [0018](../adr/0018-prior-art.md) |
| D-019 | 2026-11-04 | The writer defaults follow the measurements. | replaced | [0019](../adr/0019-writer-defaults.md) |
| D-020 | 2026-11-04 | The log holds events, and a `redact` clears the content of its target. | accepted | [0020](../adr/0020-event-model.md) |
| D-021 | 2026-11-04 | `pos` is not a field of an event. | accepted | [0021](../adr/0021-position.md) |
| D-022 | 2026-11-04 | A catalog card is a `note` event with `kind: "card"`, `for_scope`, and `for_sources`. | accepted | [0022](../adr/0022-card-event.md) |
| D-023 | 2026-11-04 | A `supersedes` stays inside one scope. | accepted | [0023](../adr/0023-supersede-scope.md) |
| D-024 | 2026-11-04 | An event has two times. | accepted | [0024](../adr/0024-event-times.md) |
| D-025 | 2026-11-04 | The note event holds `review_at` only, the date of the next review. | accepted | [0025](../adr/0025-review-date.md) |
| D-026 | 2026-11-04 | The prior-art table gives the principles, not the field names. | accepted | [0026](../adr/0026-idem-key.md) |
| D-027 | 2026-11-04 | A `target` field names the `note` event. | accepted | [0027](../adr/0027-event-target.md) |
| D-028 | 2026-11-04 | The projection is deterministic over the order `(at, id)`, and it makes two passes: one for the… | accepted | [0028](../adr/0028-projection.md) |
| D-029 | 2026-11-04 | The supersede is irreversible. | accepted | [0029](../adr/0029-irreversible-supersede.md) |
| D-030 | 2026-11-04 | A `redact` event clears the content of a record for good, and a later `amend` changes no content… | accepted | [0030](../adr/0030-final-redact.md) |
| D-031 | 2026-11-04 | The state order is `live`, `hidden`, `proposed`, `deleted`. | accepted | [0031](../adr/0031-state-order.md) |
| D-032 | 2026-11-04 | An `accept` event clears the effect of an earlier `hide` event. | accepted | [0032](../adr/0032-accept-clears-hide.md) |
| D-033 | 2026-11-04 | A rebuild of a card writes a new `note` event with the old card in `supersedes`. | accepted | [0033](../adr/0033-card-rebuild.md) |
| D-034 | 2026-11-04 | The catalog has one scope for each profile: `__catalog__:<profile>`. | accepted | [0034](../adr/0034-catalog-scope.md) |
| D-035 | 2026-11-04 | A card becomes dirty after a change of a source, and the store rebuilds it from the live records… | accepted | [0035](../adr/0035-card-dirty.md) |
| D-036 | 2026-11-04 | The model has no `scrub` step. | accepted | [0036](../adr/0036-no-scrub.md) |
| D-037 | 2026-11-04 | A card carries `body`, `kind`, `ts`, `session`, `for_scope`, and `for_sources`, and no… | accepted | [0037](../adr/0037-card-fields.md) |
| D-038 | 2026-11-04 | A node has the key `(level, start)`, and a node of level `L` covers `2^L` consecutive `pos`… | accepted | [0038](../adr/0038-node-key.md) |
| D-039 | 2026-11-04 | A summary line targets 512 bytes and stops at 640 bytes. | accepted | [0039](../adr/0039-summary-limit.md) |
| D-040 | 2026-11-04 | The frontier lists the lines from the oldest to the newest. | accepted | [0040](../adr/0040-frontier-order.md) |
| D-041 | 2026-11-04 | The rebuild follows the dirty marks. | accepted | [0041](../adr/0041-dirty-marks.md) |
| D-042 | 2026-11-04 | The project does not adopt the scope registry. | accepted | [0042](../adr/0042-no-registry.md) |
| D-043 | 2026-11-04 | A wrong key of a scope changes by an `amend` of the record. | accepted | [0043](../adr/0043-scope-rename.md) |
| D-044 | 2026-11-04 | An `amend` moves a record to the key in its `scope` field, and it does so for a record with… | accepted | [0044](../adr/0044-amend-moves.md) |
| D-045 | 2026-11-04 | The configuration is a TOML file with a `store` section and one `[profile.<name>]` section for… | accepted | [0045](../adr/0045-toml-config.md) |
| D-046 | 2026-11-04 | The configuration sets no total budget. | accepted | [0046](../adr/0046-two-budgets.md) |
| D-047 | 2026-11-04 | The subagent mode sets the access of a subagent. | accepted | [0047](../adr/0047-subagent-mode.md) |
| D-048 | 2026-11-04 | The fold takes a pair by `due` in descending order, then `level` in ascending order, then… | accepted | [0048](../adr/0048-fold-order.md) |
| D-049 | 2026-11-04 | `storeRev` is a counter that grows in the transaction of each edit in SQLite, and a fingerprint… | accepted | [0049](../adr/0049-store-version.md) |
| D-050 | 2026-11-04 | The store of memlens holds no snapshot. | accepted | [0050](../adr/0050-no-snapshot.md) |
| D-051 | 2026-11-04 | The snapshot is a cache of the plugin. | accepted | [0051](../adr/0051-context-copy.md) |
| D-052 | 2026-11-04 | The plugin reads the text of the last snapshot from the session history and gives that text at… | accepted | [0052](../adr/0052-history-text.md) |
| D-053 | 2026-11-04 | The body of the card is the answer of the model, and the limit is 512 bytes. | accepted | [0053](../adr/0053-card-prompt.md) |
| D-054 | 2026-11-04 | The compaction runs outside the agent loop. | accepted | [0054](../adr/0054-compaction-queue.md) |
| D-055 | 2026-11-04 | A `redact` runs in one transaction. | accepted | [0055](../adr/0055-redact-transaction.md) |
| D-056 | 2026-11-04 | The compression works on `<directions>` first, then on `<here>`, and it cuts no policy text. | accepted | [0056](../adr/0056-compression.md) |
| D-057 | 2026-11-04 | The nudge is one line after the frozen slice, so the cached prefix stays put. | accepted | [0057](../adr/0057-nudge-cache.md) |
| D-058 | 2026-11-04 | The default text of the nudge names no unit: `[memory] {n} steps since the last record. | accepted | [0058](../adr/0058-nudge-text.md) |
| D-059 | 2026-11-04 | A merge gives the model the two children only. | accepted | [0059](../adr/0059-writer-forms.md) |
| D-060 | 2026-11-04 | A scope key has the form `kind:name`. | accepted | [0060](../adr/0060-scope-key.md) |
| D-061 | 2026-11-04 | The scope grammar covers the keys that the agent sees. | accepted | [0061](../adr/0061-scope-grammar.md) |
| D-062 | 2026-11-04 | The `pos` of an address is the ordinal in the scope. | accepted | [0062](../adr/0062-scope-address.md) |
| D-063 | 2026-11-04 | The part `*` of a scope key stands in the kind or in the name, and it matches any text of that part. | accepted | [0063](../adr/0063-wildcard-key.md) |
| D-064 | 2026-11-04 | The slice goes to `systemPrompt.context`, not to a system prompt section. | accepted | [0064](../adr/0064-context-injection.md) |
| D-065 | 2026-11-04 | The plugin config is a deep merge of three layers: the memlens TOML file, the profile patch in… | accepted | [0065](../adr/0065-config-merge.md) |
| D-066 | 2026-11-04 | The agent surface is `memory_find`, `memory_open`, `memory_note`, and `memory_forget`. | replaced | [0066](../adr/0066-old-surface.md) |
| D-067 | 2026-11-04 | The writer takes the provider of the model route when `provider` is empty. | accepted | [0067](../adr/0067-writer-provider.md) |
| D-068 | 2026-11-05 | The descent of `memory_open` stops at a working budget of 4096 visited nodes and at an answer of… | accepted | [0068](../adr/0068-open-budget.md) |
| D-069 | 2026-11-05 | A subagent write is always `proposed`. | accepted | [0069](../adr/0069-proposals.md) |
| D-070 | 2026-11-05 | The agent surface is `memory_find`, `memory_open`, `memory_note`, `memory_forget`,… | accepted | [0070](../adr/0070-tool-surface.md) |
| D-071 | 2026-11-05 | The default export copies the whole store under an exclusive lock. | accepted | [0071](../adr/0071-export-import.md) |
| D-072 | 2026-11-05 | The index port takes the query after the parse: the words, the words with `-`, the scopes, the… | accepted | [0072](../adr/0072-index-port.md) |
| D-073 | 2026-11-05 | The profile patch gives `customPrompt` and `customPromptAppend`. | accepted | [0073](../adr/0073-custom-prompt.md) |
