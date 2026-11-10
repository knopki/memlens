# Superseded requirements

This file retains replaced requirements and originals of local code rules. Archived rows are historical and have no active requirement status.
The live rule is a cross-module requirement in [02-requirements.md](02-requirements.md), or a linked code contract.
The local rules below retain their original words, status, source, and test method for history.

| ID | Requirement | Type | Source | Replaced by |
| --- | --- | --- | --- | --- |
| REQ-307 | A second write with the same `idem` creates no record. | FR | S-070 | S-149 removes idem. |
| REQ-368 | The tool call sets the `idem` of a write. | FR | S-071 | S-149 removes idem. |
| REQ-021 | The slice updates at a new session, at a compaction after success, and at an idle time longer than the TTL. | FR | S-013, S-067 | REQ-300 |
| REQ-035 | A line about the subagent write goes to the report of the parent. | FR | S-013 | REQ-157 |
| REQ-036 | A subagent cannot hide a note and cannot review a note. | FR | S-013, S-067 | REQ-356 |
| REQ-055 | A session is a branch of a profile, and an import joins the records of the branch to the trunk. | FR | S-014, S-076 | REQ-375, REQ-057 |
| REQ-112 | A record with the state `proposed`, `hidden`, or `deleted` does not enter the card. | FR | S-023 | REQ-191 |
| REQ-248 | A merge gives the model the two children only, and no other context. | FR | S-061 | REQ-433 |
| REQ-364 | A `pos` target of `memory_forget` needs a `scope`. | FR | S-071 | REQ-338 |
| REQ-365 | A write of the kind `decision`, `preference`, or `note` without `reviewIn` gives a review date of 365 days. | FR | S-071 | REQ-457 |
| REQ-366 | A write of the kind `fact` without `reviewIn` gives a review date of 180 days. | FR | S-071 | REQ-457 |
| REQ-367 | A write of the kind `task` without `reviewIn` gives a review date of 7 days. | FR | S-071 | REQ-457 |
| REQ-369 | The write mechanism moves the text above 512 bytes into the `longform`. | FR | S-072 | REQ-011 |
| REQ-118 | A card with a redacted id in `for_sources` gets the sanitized form. | FR | S-023 | REQ-220 |
| REQ-128 | A node holds `summary`, `ts_from`, `ts_to`, `bytes`, `input_gen`, `state`, `built_at`, and `truncated`. | FR | S-025 | REQ-073 |
| REQ-190 | A session end or a compaction starts the card build of each scope with records of the session. | FR | S-049 | REQ-137 |
| REQ-193 | The `body` of the card is 512 bytes maximum. | FR | S-049 | REQ-127 |
| REQ-194 | Without a model answer, the store joins the three last bodies of the input with `; `. | FR | S-049 | REQ-217 |
| REQ-195 | The fallback takes the three records with the latest `ts`. | FR | S-050 | REQ-217 |
| REQ-196 | The fallback cuts the text at a word boundary to 512 bytes, and at a character boundary for a word above the limit. | FR | S-050 | REQ-217 |
| REQ-197 | The build retries the model when the answer holds no text or more than 512 bytes. | FR | S-050 | REQ-217 |
| REQ-198 | The build uses the fallback after the last retry. | FR | S-050 | REQ-217 |
| REQ-199 | A scope with no live record of the session gives no card. | FR | S-050 | REQ-217 |
| REQ-070 | An `accept` event carries `target`, and it changes a proposed note to `live`. | FR | S-016 | REQ-473 |
| REQ-094 | An `accept` event changes the state to `live` only at an actual transition. | FR | S-020 | REQ-473 |
| REQ-095 | An `accept` event applies the `supersedes` of the note. | FR | S-020 | REQ-093 |
| REQ-097 | A `dismiss` event sets the state to the maximum of the state and `deleted`. | FR | S-020 | REQ-474 |
| REQ-107 | An `accept` event returns a proposed record that a `hide` event hid to the view. | FR | S-022 | REQ-473 |
| REQ-005 | The README has the eight languages of the DSH set. | FR | S-003, S-088 | REQ-006 |
| REQ-430 | The README of the plugin package has eight languages: `de`, `en`, `es`, `fr`, `ja`, `pt`, `ru`, and `zh`. | FR | S-081 | REQ-006 |
| REQ-431 | The localization covers the product interface, the READMEs, and the installation and usage instructions. | FR | S-081 | REQ-006 |
| REQ-157 | In the mode `propose`, the parent gets a report about the proposed notes. | FR | S-037 | REQ-359 |
| REQ-358 | The report of the parent gets one line for each proposal of the child. | FR | S-070 | REQ-359 |
| REQ-274 | The catalog key is hidden from the agent. | FR | S-064 | REQ-108 |
| REQ-279 | The key `*` in `scopes` matches each scope. | FR | S-066 | REQ-151 |
| REQ-029 | The plugin config is the deep merge of the memlens config, the profile patch, and the preset patch. The patch wins over the memlens config, and the preset wins over the profile. | FR | S-013, S-067 | [config.d.ts](config.d.ts) |
| REQ-147 | The `store` section gives `backend` and `path`. | FR | S-013 | [config.d.ts](config.d.ts) |
| REQ-150 | Each profile has the section `[profile.<name>]`. | FR | S-067 | [config.d.ts](config.d.ts) |
| REQ-152 | The profile budget gives `here` and `directions` in bytes. | FR | S-036, S-037 | [config.d.ts](config.d.ts) |
| REQ-153 | The profile gives the subagent mode `propose`, `read`, or `off`. | FR | S-037 | [config.d.ts](config.d.ts) |
| REQ-230 | The `[nudge]` section gives `mode`, `tool_calls`, `turns`, `expensive`, and `text`. The patch gives `mode` and `tool_calls`, and the TOML file gives the other three. | FR | S-058 | [config.d.ts](config.d.ts) |
| REQ-231 | The `mode` of the nudge is `tools`, `turns`, `expensive`, or `off`. | FR | S-058 | [config.d.ts](config.d.ts) |
| REQ-287 | The general config and the patch give `defaultProfile`. The preset `profile` wins over it. | FR | S-067 | [config.d.ts](config.d.ts) |
| REQ-288 | The `store` key of the plugin config sets the same store as the TOML `store` section and `MEMLENS_STORE`. The plugin takes the patch first, then `MEMLENS_STORE`, then the TOML file. | FR | S-067 | [config.d.ts](config.d.ts) |
| REQ-289 | The `writer` section gives `provider`, `model`, `effort`, `mode`, `batch`, and `maxCallsPerHour`. | FR | S-051 | [config.d.ts](config.d.ts) |
| REQ-452 | The profile patch gives `customPrompt` and `customPromptAppend`. | FR | S-094 | [config.d.ts](config.d.ts) |
| REQ-456 | The `review` section of the config gives the review period of each kind in days. | FR | S-097 | [config.d.ts](config.d.ts) |
| REQ-443 | The default budget `here` is 17 KiB. | FR | S-083 | [config.d.ts](config.d.ts) |
| REQ-444 | The default budget `directions` is 3 KiB. | FR | S-083 | [config.d.ts](config.d.ts) |
| REQ-256 | The kind of a scope key is `project`, `global`, `agent`, `user`, `topic`, `task`, or `import`. | FR | S-063 | REQ-255 |
| REQ-257 | The name of a scope key starts with a lowercase letter or a digit. | FR | S-063 | REQ-255 |
| REQ-258 | The name of a scope key holds lowercase letters, digits, the period, the underscore, the slash, and the hyphen only. | FR | S-063 | REQ-255 |
| REQ-018 | The plugin renders the text of the snapshot from the store at a trigger. | FR | S-046 | REQ-300 |
| REQ-178 | The slice is one `<memory>` block with `<how-to>`, `<directions>`, and `<here>`. | FR | S-042, S-067, S-102 | [06-architecture.md](06-architecture.md) |
| REQ-179 | The `<how-to>` block holds the policy text of [09-prompts.md](09-prompts.md). The text holds no XML tag and no tool signature. | FR | S-042, S-067, S-101, S-102 | [06-architecture.md](06-architecture.md) |
| REQ-180 | The `<directions>` block holds one line for each scope of the profile, and the line is the direction line of that scope. | FR | S-067 | [06-architecture.md](06-architecture.md) |
| REQ-181 | The `<here>` block holds the frontier of the active scope. | FR | S-067 | [06-architecture.md](06-architecture.md) |
| REQ-224 | The compression turns an old line of `<directions>` into one line. | FR | S-056 | REQ-223 |
| REQ-226 | A part of the slice above 1.5 times its budget loses the oldest lines of `<here>` until it fits 1.5 times its budget. | FR | S-056 | REQ-223 |
| REQ-227 | The omitted lines leave one line `#<a>-<b> omitted (N lines, compacting)`. | FR | S-056 | REQ-223 |
| REQ-234 | The nudge changes no byte of the frozen slice. | FR | S-058 | REQ-233 |
| REQ-243 | A turn with more than `expensive` steps demands a write before its end. | FR | S-059 | No requirement in this version. |
| REQ-246 | The default `text` of the nudge names no unit of the count. | FR | S-060 | REQ-237 |
| REQ-293 | The agent tools are `memory_find`, `memory_open`, `memory_note`, `memory_forget`, `memory_review`, and `memory_scope`. | FR | S-067, S-070 | [tools.d.ts](tools.d.ts) |
| REQ-294 | `memory_note` takes `body`, `longform`, `scope`, `kind`, `supersedes`, and `reviewIn`, and the last five are optional. | FR | S-067, S-070 | [tools.d.ts](tools.d.ts) |
| REQ-296 | `memory_find` takes `query`, `scopes`, `since`, `until`, `kinds`, `due`, and `limit`, and it searches by words. | FR | S-067, S-070 | [tools.d.ts](tools.d.ts) |
| REQ-302 | `memory_note` returns the `addr`, the `id`, the `state`, and the `review_at` of the record. A proposed write returns the `id` only. | FR | S-070, S-101 | [tools.d.ts](tools.d.ts) |
| REQ-304 | `memory_note` accepts the kinds `decision`, `preference`, `fact`, `task`, and `note`. | FR | S-070 | [tools.d.ts](tools.d.ts) |
| REQ-305 | Each target of `supersedes` is a `pos` or an `addr`. | FR | S-070 | [tools.d.ts](tools.d.ts) |
| REQ-308 | `reviewIn` takes a period in days or the word `never`. | FR | S-070 | [tools.d.ts](tools.d.ts) |
| REQ-317 | A hit gives the `addr`, the `pos`, and the line of the record. | FR | S-070 | [tools.d.ts](tools.d.ts) |
| REQ-318 | Each hit carries the `addr`, because a `pos` of another scope is ambiguous. | FR | S-070 | [tools.d.ts](tools.d.ts) |
| REQ-320 | The `target` of `memory_open` is an `addr`, a `pos` of the active scope, or a range `a-b`. | FR | S-070 | [tools.d.ts](tools.d.ts) |
| REQ-321 | An entry answer gives the `addr`, the `pos`, the `id`, the `ts`, the `scope`, the `body`, and the `review_at`. | FR | S-070 | [tools.d.ts](tools.d.ts) |
| REQ-322 | An entry answer gives the `longform`, the `longformBytes`, the `longformOffset`, the `longformTruncated`, and the `refs`. | FR | S-070 | [tools.d.ts](tools.d.ts) |
| REQ-323 | Each part of a block gives the `label`, the `body`, the `ts_from`, the `ts_to`, the `built`, and the `needsExpansion`. | FR | S-070 | [tools.d.ts](tools.d.ts) |
| REQ-324 | A block answer gives the `truncated`, the `next`, and the `notice`. | FR | S-070 | [tools.d.ts](tools.d.ts) |
| REQ-338 | `memory_forget` takes the `targets`, the `reason`, and the `scope` of a `pos` target. | FR | S-070 | [tools.d.ts](tools.d.ts) |
| REQ-339 | `memory_forget` returns the count of hidden records, the count of queued rebuilds, and the count of queued top nodes. | FR | S-070, S-104 | [tools.d.ts](tools.d.ts) |
| REQ-340 | `memory_review` returns the due records with the `addr`, the `scope`, the `pos`, the `ts`, the `kind`, the `body`, and the `review_at`. | FR | S-070 | [tools.d.ts](tools.d.ts) |
| REQ-341 | `memory_review` returns the count of reviewed records and the next review date. | FR | S-070 | [tools.d.ts](tools.d.ts) |
| REQ-345 | The tool `memory_scope` takes the `action` and the `scope`. | FR | S-070, S-088 | [tools.d.ts](tools.d.ts) |
| REQ-346 | The `action` of `memory_scope` is `list`. | FR | S-070, S-088 | [tools.d.ts](tools.d.ts) |
| REQ-347 | The action `list` gives each scope with the `key`, the `notes`, the `lastSeen`, and the `writable`. | FR | S-070, S-088 | [tools.d.ts](tools.d.ts) |
| REQ-440 | The direction line starts with `[<key>] `. | FR | S-089 | REQ-297 |
| REQ-455 | With both keys, the template of `customPrompt` holds the append text at `{{append}}`. | FR | S-103 | REQ-454 |
| REQ-225 | The compression of `<here>` keeps at least 60 percent of the budget. | FR | S-056 | No requirement. |
| REQ-330 | `parts` is 32 by default and 32 maximum. | FR | S-070 | No requirement. |
| REQ-332 | `depth` is the level of detail of the answer, from 1 to 4. | FR | S-070 | No requirement. |
| REQ-333 | `depth` is no limit of the descent to the clean nodes. | FR | S-070 | No requirement. |
| REQ-329 | The answer of `memory_open` is 24 576 characters maximum. | FR | S-070 | REQ-228 |
| REQ-331 | `next` continues a block that reaches the answer size limit. | FR | S-070 | REQ-228 |
| REQ-334 | The descent to the clean nodes visits 4096 nodes at most. | FR | S-070 | REQ-228 |
| REQ-335 | A descent that stops at the budget gives a part with `needsExpansion` and its `label`. | FR | S-070 | REQ-228 |
| REQ-336 | `memory_open` of the range with `needsExpansion` opens that range. | FR | S-070 | REQ-228 |
| REQ-387 | `memlens note` takes the `body` argument and the flags `--longform`, `--scope`, `--kind`, `--supersedes`, and `--review`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-388 | `memlens find` takes the words argument and the flags `--scope`, `--since`, `--until`, `--due`, `--limit`, and `--json`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-389 | `memlens open` takes the target argument and the flags `--scope`, `--no-longform`, and `--offset`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-390 | `memlens forget` takes the target argument and the flags `--reason` and `--scope`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-391 | `memlens review` gives the due records, and it takes the flags `--limit` and `--json`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-392 | `memlens review --mark` sets the review date of the named records, and it takes the flags `--scope` and `--for`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-393 | `memlens redact` takes the target argument and the flags `--reason` and `--yes`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-394 | `memlens amend` takes the target argument and the flags `--body` and `--longform`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-395 | `memlens scopes` gives the visible scopes, and the flag `--json` gives the machine form. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-396 | `memlens slice` renders a fresh slice for a profile, and it takes the flags `--profile` and `--json`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-397 | `memlens compact` gives the next compaction job of a scope, and it takes the flags `--scope`, `--max`, and `--dry-run`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-398 | `memlens status` gives the state of the store, and the flag `--json` gives the machine form. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-399 | `memlens check` gives the result of the test of the store, and the flag `--json` gives the machine form. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-400 | `memlens repair` fixes the store, and the flag `--dry-run` lists the changes only. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-401 | The `--format` of `memlens export` is `md` or `jsonl`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-402 | `memlens import` takes the flags `--in`, `--as`, and `--dry-run`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-403 | `memlens import --from dsh-sessions` reads a directory of harness sessions, and it takes the flags `--since` and `--dry-run`. | FR | S-075, S-076 | [06-architecture.md](06-architecture.md) |
| REQ-405 | `memlens config` has the actions `get` and `set`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-406 | `memlens ui` starts the console, and it takes the flags `--port` and `--allow-delete`. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-407 | The exit code 0 marks a success. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-408 | The exit code 1 marks an error of the data. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-409 | The exit code 2 marks an error of the usage. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-410 | The exit code 3 marks a refusal by a policy. | FR | S-075 | [06-architecture.md](06-architecture.md) |
| REQ-047 | In the harness the console runs in a session mode on the same view models. | FR | S-013 | [08-ui.md](08-ui.md) |
| REQ-420 | `memlens ui` hosts the full console. | FR | S-077 | [08-ui.md](08-ui.md) |
| REQ-421 | The plugin mounts the console as the tab `Memory` on the session page. | FR | S-077 | [08-ui.md](08-ui.md) |
| REQ-422 | The tab shows the scopes of one profile. | FR | S-077 | [08-ui.md](08-ui.md) |
| REQ-424 | The tab gives no choice of the profile, because the session sets it. | FR | S-078 | [08-ui.md](08-ui.md) |
| REQ-425 | `memlens ui` gives its own styles. | FR | S-080 | [08-ui.md](08-ui.md) |
| REQ-426 | The plugin renders the tab with the components of the harness UI. | FR | S-080 | [08-ui.md](08-ui.md) |
| REQ-446 | The tab `Memory` mounts in the slot `conversation.session.header`. | FR | S-085 | [08-ui.md](08-ui.md) |
| REQ-447 | The kind of the tab is `memlens`. | FR | S-085 | [08-ui.md](08-ui.md) |
| REQ-281 | The plugin registers one runtime context for each agent at `agent/created`. | FR | S-067 | [06-architecture.md](06-architecture.md) |
| REQ-282 | The runtime context is bound to the agent scope, and another agent does not receive it. | FR | S-067 | [06-architecture.md](06-architecture.md) |
| REQ-283 | The registration reads `agent.session.id`, `agent.session.meta.agentPreset`, and `agent.session.meta.cwd`. | FR | S-067 | [06-architecture.md](06-architecture.md) |
| REQ-284 | The runtime context has a fixed order of 220, after the built-in contexts. | FR | S-067 | [06-architecture.md](06-architecture.md) |
| REQ-032 | A background writer makes the retellings in batches. | FR | S-013 | REQ-203 |
| REQ-052 | A background compactor makes the retellings in parallel jobs. | FR | S-014 | REQ-203 |

## Removed requirements

The customer refused these items with no replacement. The item stays for the record, and it is not
live.

| ID | Requirement | Type | Source | Removed by |
| --- | --- | --- | --- | --- |
| REQ-292 | The policy text names `memory_find`, `memory_open`, `memory_note`, and `memory_forget`. | FR | S-067 | S-095 |
| REQ-211 | `gen` grows on a `note` or op event that affects the block, and a `node` event changes no `gen`. | FR | S-051 | REQ-462, REQ-465 |
| REQ-207 | A position with no built parent shows its raw records in the view. | FR | S-051 | REQ-217 |
| REQ-073 | A `node` event carries `level`, `start`, `child_a`, `child_b`, `input_rev`, `summary`, `chars`, `truncated`, `ts_from`, and `ts_to`. | FR | S-016, S-121 | [tree.d.ts](tree.d.ts) |
| REQ-123 | A node of level `L` covers `2^L` consecutive `pos` values, for a level of 1 or more. | FR | S-025 | [tree.d.ts](tree.d.ts) |
| REQ-129 | A node is `built` when the event of each child sits at its half of the range. | FR | S-025, S-121 | [tree.d.ts](tree.d.ts) |
| REQ-462 | The `rev` of a range is the order of the latest event that touches the range. | FR | S-100, S-121 | [tree.d.ts](tree.d.ts) |
| REQ-465 | An event touches a range when the position of the event or the position of its target is in the range. | FR | S-100, S-121 | [tree.d.ts](tree.d.ts) |
| REQ-470 | The field `input_rev` holds the revision of the two children at the build. | FR | S-100, S-121 | [tree.d.ts](tree.d.ts) |
| REQ-478 | A node is `clean` when the revision of its two children equals `input_rev`. | FR | S-121 | [tree.d.ts](tree.d.ts) |
| REQ-481 | A `node` event touches its own range. | FR | S-121 | [tree.d.ts](tree.d.ts) |
| REQ-206 | At a session start a part above 1.5 times its budget because of nodes that are not built starts a build. | FR | S-051, S-067 | REQ-204 |
| REQ-215 | The deadline of the build at a session start is 10 seconds. | FR | S-052 | REQ-204 |
| REQ-201 | A worker holds a job under a lease of 120 seconds. | FR | S-051, S-142 | REQ-200, REQ-210 |
| REQ-208 | The build has a deadline of 10 seconds, and the render waits for it. | FR | S-051, S-067, S-142 | REQ-205 |
| REQ-473 | A decision is a write op with the field `accepts`, the id of the proposal. The decision applies as a normal op. | FR | S-101, S-142 | REQ-360, REQ-361 |

## Local rules in code contracts

S-145 moves these local rules beside their implementations. The original columns stay unchanged for history.
The last column names the live contract. The original status is historical and grants no active requirement status.

| ID | Requirement | Type | Original status | Source | Test method | Live contract |
| --- | --- | --- | --- | --- | --- | --- |
| REQ-011 | The `body` has 512 characters maximum and the declared size is 384 characters. Text above the body limit moves into the `longform` document. | FR | accepted | S-015 | The store accepts a body of 512 characters. A body of 513 characters keeps the limit in the body and moves the rest into the `longform`. | [note-body.ts: splitBody](../../packages/core/src/domain/note-body.ts#L53) |
| REQ-012 | A `longform` document is 16 384 characters maximum.                                                                                                                                   | FR   | accepted | S-013, S-117        | The store refuses a longform of 16 384 characters and one more character.                                                      | [note-body.ts: splitBody](../../packages/core/src/domain/note-body.ts#L53) |
| REQ-037 | The record of a note holds `review_at`, the date of the next review.                                                                                                                  | FR   | accepted  | S-017               | The record has `review_at` from the note event.                                                                                | [projection.ts: recordFromNote](../../packages/core/src/domain/projection.ts#L62) |
| REQ-048 | The tree has a frontier: levels of fixed width, and one level covers 2^k leaves.                                                                                                      | FR   | accepted  | S-014               | Two builds give the same levels for the same notes.                                                                            | [tree.ts: moduleContract](../../packages/core/src/domain/tree.ts#L2) |
| REQ-058 | A note can supersede an earlier note.                                                                                                                                                 | FR   | accepted  | S-014               | The newer note replaces the older note in the view.                                                                            | [projection.ts: applySupersedes](../../packages/core/src/domain/projection.ts#L165) |
| REQ-075 | A position is the ordinal of a real record entry into a scope in canonical event order, with no event pos field. | FR   | accepted | S-016, S-088, S-101, S-118, S-142 | Creation and scope transfer allocate positions. A proposal allocates none. Leaving a scope keeps the earlier slot empty. | [projection.ts: assignPositions](../../packages/core/src/domain/projection.ts#L305) |
| REQ-076 | A `pos` is local to one scope, so one record can get another `pos` in another store.                                                                                                  | FR   | accepted  | S-016, S-088        | An import of one record into two stores gives two `pos` values.                                                                | [projection.ts: assignPositions](../../packages/core/src/domain/projection.ts#L305) |
| REQ-078 | A sanitized content event preserves its operation and metadata while clearing applicable content fields according to [events.d.ts](events.d.ts). | FR   | accepted | S-016, S-118, S-140, S-141 | Check note, amend, and node forms. A scope-only amendment keeps absent content fields absent. | [sanitization.ts: sanitizeEvent](../../packages/core/src/domain/sanitization.ts#L23) |
| REQ-084 | An amendment within one scope preserves the address, while a scope transfer gives a new destination address. | FR   | accepted  | S-018, S-142 | A body edit keeps the address. A transfer empties the old slot and appends a new destination slot. | [projection.ts: applyAmendment](../../packages/core/src/domain/projection.ts#L197) |
| REQ-086 | The projection makes two passes: one for the records and one for the operations.                                                                                                      | FR   | accepted  | S-020               | The store makes each record before it applies the first operation.                                                             | [projection.ts: project](../../packages/core/src/domain/projection.ts#L354) |
| REQ-087 | The projection orders the events by `(at, id)`.                                                                                                                                       | FR   | accepted  | S-020               | Two events with one `at` value follow their `id` order.                                                                        | [projection.ts: project](../../packages/core/src/domain/projection.ts#L354) |
| REQ-088 | A local `pos` does not change the projection.                                                                                                                                         | FR   | accepted  | S-020               | Two stores with different `pos` values give one projection.                                                                    | [projection.ts: assignPositions](../../packages/core/src/domain/projection.ts#L305) |
| REQ-089 | Pass 1 makes one record for each `note` event.                                                                                                                                        | FR   | accepted  | S-020               | A log of two note events gives two records.                                                                                    | [projection.ts: collectRecords](../../packages/core/src/domain/projection.ts#L87) |
| REQ-090 | The record copies each payload field of the note event.                                                                                                                               | FR   | accepted  | S-020               | Each field of the note event has the same value on the record.                                                                 | [projection.ts: recordFromNote](../../packages/core/src/domain/projection.ts#L62) |
| REQ-091 | The record sets `recorded_at` to the `at` of the note event.                                                                                                                          | FR   | accepted  | S-020               | The two values are equal after an import of the event.                                                                         | [projection.ts: recordFromNote](../../packages/core/src/domain/projection.ts#L62) |
| REQ-092 | The state of a record is `live`, `hidden`, or `deleted`. | FR | accepted | S-020, S-101 | A record after a note has the state `live`, and a record after a hide has the state `hidden`. | [projection.ts: moduleContract](../../packages/core/src/domain/projection.ts#L2) |
| REQ-093 | A `note` event with the state `live` applies its `supersedes`.                                                                                                                        | FR   | accepted  | S-020               | The targets are hidden after the projection.                                                                                   | [projection.ts: applySupersedes](../../packages/core/src/domain/projection.ts#L165) |
| REQ-096 | A `hide` event sets the state to the maximum of the state and `hidden`.                                                                                                               | FR   | accepted  | S-020               | A deleted record stays deleted after a hide.                                                                                   | [projection.ts: applyRecordOperation](../../packages/core/src/domain/projection.ts#L226) |
| REQ-098 | Redact events and sanitized note or amend copies set the record to `deleted` with `content_cleared`. | FR   | accepted  | S-020, S-140, S-141 | Import a sanitized amend without a redact event. Its target stays deleted and content-cleared after a restart. | [projection.ts: clear](../../packages/core/src/domain/projection.ts#L50) |
| REQ-099 | An `amend` event changes `body` or `longform` while `content_cleared` is not set.                                                                                                     | FR   | accepted  | S-020               | An amend after a redact changes no content.                                                                                    | [projection.ts: applyAmendment](../../packages/core/src/domain/projection.ts#L197) |
| REQ-100 | A `review` event sets `review_at`.                                                                                                                                                    | FR   | accepted  | S-020               | The field holds the new date after the review.                                                                                 | [projection.ts: applyRecordOperation](../../packages/core/src/domain/projection.ts#L226) |
| REQ-101 | The `supersedes` of a note applies one time, at the write of the note. | FR | accepted | S-020, S-101 | A later event for the note applies the supersede no more. | [projection.ts: applySupersedes](../../packages/core/src/domain/projection.ts#L165) |
| REQ-102 | For each target of a `supersedes`, the state becomes the maximum of the state and `hidden`.                                                                                           | FR   | accepted  | S-020               | A deleted target stays deleted after the supersede.                                                                            | [projection.ts: applySupersedes](../../packages/core/src/domain/projection.ts#L165) |
| REQ-103 | The field `superseded_by` gets the id of the note that supersedes, if the field is empty.                                                                                             | FR   | accepted  | S-020               | A second note with one target does not change the field.                                                                       | [projection.ts: applySupersedes](../../packages/core/src/domain/projection.ts#L165) |
| REQ-104 | A later hide or delete of the note that supersedes does not cancel the supersede.                                                                                                     | FR   | accepted  | S-020               | The target stays hidden after the other note hides.                                                                            | [projection.ts: applySupersedes](../../packages/core/src/domain/projection.ts#L165) |
| REQ-105 | An event with `redacted: true` gives no content.                                                                                                                                      | FR   | accepted  | S-020               | The record of this event has an empty `body` and a null `longform`.                                                            | [projection.ts: clear](../../packages/core/src/domain/projection.ts#L50) |
| REQ-106 | A `supersedes` applies even when its target has a later `(at, id)` position.                                                                                                          | FR   | accepted  | S-020               | A target later in the order is still hidden.                                                                                   | [projection.ts: applySupersedes](../../packages/core/src/domain/projection.ts#L165) |
| REQ-120 | A shared scope gets one position in each profile where it is visible. | FR | accepted | S-023, S-104 | Two profiles with one shared scope give two positions. | [projection.ts: catalogTree](../../packages/core/src/domain/projection.ts#L419) |
| REQ-122 | A tree node has the key `(level, start)`.                                                                                                                                             | FR   | accepted  | S-025               | The store addresses each node by its level and its start.                                                                      | [tree.ts: moduleContract](../../packages/core/src/domain/tree.ts#L2) |
| REQ-125 | A position is empty when it holds no live record.                                                                                                                                     | FR   | accepted  | S-025               | A hidden note makes its position empty.                                                                                        | [tree.ts: moduleContract](../../packages/core/src/domain/tree.ts#L2) |
| REQ-126 | The frontier renders no empty position.                                                                                                                                               | FR   | accepted  | S-025               | The frontier text holds no empty position.                                                                                     | [tree.ts: frontier](../../packages/core/src/domain/tree.ts#L505) |
| REQ-130 | The tree needs no dense prefix.                                                                                                                                                       | FR   | accepted  | S-025               | A hidden note in a range leaves a hole, and the geometry stays.                                                                | [tree.ts: moduleContract](../../packages/core/src/domain/tree.ts#L2) |
| REQ-131 | A non-empty range takes `ts_from` and `ts_to` from its first and last live notes in position order. | FR | accepted | S-026, S-137 | Hidden records at either edge and empty padding give no date. The dates use ts, not at. | [tree.ts: period](../../packages/core/src/domain/tree.ts#L201) |
| REQ-133 | The tree holds no node of level 0: the leaf is the record itself.                                                                                                                     | FR   | accepted  | S-028               | The store builds no summary for one position.                                                                                  | [tree.ts: moduleContract](../../packages/core/src/domain/tree.ts#L2) |
| REQ-134 | The frontier lists the lines from the oldest level to the newest level.                                                                                                               | FR   | accepted  | S-029               | The first line covers the oldest position, and the last line the newest.                                                       | [tree.ts: slice](../../packages/core/src/domain/tree.ts#L537) |
| REQ-138 | The sources of a node are its two children.                                                                                                                                           | FR   | accepted  | S-030               | A level-2 node takes the two level-1 nodes below.                                                                              | [tree.ts: isBuilt](../../packages/core/src/domain/tree.ts#L145) |
| REQ-140 | A node waits for its two children.                                                                                                                                                    | FR   | accepted  | S-031               | A node with a dirty child waits.                                                                                               | [tree.ts: input](../../packages/core/src/domain/tree.ts#L226) |
| REQ-142 | A scope exists when a record names its key.                                                                                                                                           | FR   | accepted | S-033               | A write to a new key makes the scope.                                                                                          | [projection.ts: collectRecords](../../packages/core/src/domain/projection.ts#L87) |
| REQ-143 | A scope-changing amend empties the old position and allocates a new position in its destination scope. | FR   | accepted | S-034, S-142 | Move A to B and back to A. Each transfer gets a fresh destination slot, while the source note id remains unchanged. | [projection.ts: applyAmendment](../../packages/core/src/domain/projection.ts#L197) |
| REQ-144 | An `amend` that moves a record with `redacted: true` changes its scope, and the record keeps the cleared content. | FR | accepted | S-034, S-104 | A redacted record moves, and its body stays empty. | [projection.ts: applyAmendment](../../packages/core/src/domain/projection.ts#L197) |
| REQ-161 | The view is a tiling of `[0, total)` with non-overlapping ranges.                                                                                                                     | FR   | accepted | S-040, S-121        | Two ranges never cover one position.                                                                                           | [tree.ts: sparseBlocks](../../packages/core/src/domain/tree.ts#L431) |
| REQ-162 | The field `due` of a pair is `(total - (start + 2^(level+1) - 1)) / 2^level`.                                                                                                            | FR   | accepted  | S-040               | A level-2 pair at start 0 with `total` 100 gives 23.25.                                                                        | [tree.ts: due](../../packages/core/src/domain/tree.ts#L404) |
| REQ-163 | A merge needs two neighbors of one level.                                                                                                                                             | FR   | accepted | S-040               | Two ranges of different levels give no merge.                                                                                  | [tree.ts: selectMerge](../../packages/core/src/domain/tree.ts#L460) |
| REQ-164 | A merge needs a `start` that is a multiple of `2^(level+1)`.                                                                                                                          | FR   | accepted  | S-040               | A level-2 pair at start 4 gives no merge.                                                                                      | [tree.ts: selectMerge](../../packages/core/src/domain/tree.ts#L460) |
| REQ-165 | A pair merges though the node of its range is not `built`.                                                                                                                            | FR   | accepted | S-040, S-121        | A pair without a node gives two lines, and a temporary line takes their place.                                                 | [tree.ts: selectMerge](../../packages/core/src/domain/tree.ts#L460) |
| REQ-166 | At equal jump penalty, the fold compares highest due, lowest level, then lowest start. | FR   | accepted  | S-040, S-142 | Pairs with one penalty follow the same order as the demo. | [tree.ts: selectMerge](../../packages/core/src/domain/tree.ts#L460) |
| REQ-167 | The fold merges only while the rendered line count exceeds the budget and stops as soon as it fits. | FR   | accepted  | S-040, S-142 | A budget of ten leaves a ten-line view unchanged and reduces eleven lines only until ten remain. | [tree.ts: frontier](../../packages/core/src/domain/tree.ts#L505) |
| REQ-168 | A fold preserves the text of lines outside its selected pairs. | FR   | accepted | S-040, S-142 | Only selected ranges change during the fold. The other line texts stay the same. | [tree.ts: slice](../../packages/core/src/domain/tree.ts#L537) |
| REQ-171 | The fold makes no model call. | FR   | accepted  | S-040, S-142 | Fold ranges with no ready summaries. The model receives no call, and temporary lines fill the selected ranges. | [tree.ts: moduleContract](../../packages/core/src/domain/tree.ts#L2) |
| REQ-177 | The fold appends no node event. | FR   | accepted | S-041, S-142 | A missing parent gives a temporary line in the view and creates no log event. | [tree.ts: moduleContract](../../packages/core/src/domain/tree.ts#L2) |
| REQ-191 | The input of a node is its two children: the summaries of two nodes, or the bodies of two notes. | FR | accepted | S-049 | A level-1 node takes two bodies. A higher node takes two summaries. | [tree.ts: input](../../packages/core/src/domain/tree.ts#L226) |
| REQ-200 | Writer candidates derive from dirty non-empty ranges through the root, with no stored queue. | FR   | accepted | S-051, S-121, S-123, S-142 | An absent summary remains a candidate. A restart derives the same candidates from the log without a jobs table. | [tree.ts: candidates](../../packages/core/src/domain/tree.ts#L333) |
| REQ-217 | A line is temporary unless the node of its range is `built` and `clean`.                                                                                                              | FR   | accepted | S-054, S-119, S-121 | A range with no node, and a range with a node that is not clean, give a temporary line.                                        | [tree.ts: slice](../../packages/core/src/domain/tree.ts#L537) |
| REQ-220 | A redaction clears every historical node whose child dependencies reach cleared event ids. | FR | accepted | S-054, S-140, S-141 | Move a note, import earlier events, and redact it. Old and current dependent summaries are empty. | [sanitization.ts: redactionClosure](../../packages/core/src/domain/sanitization.ts#L175) |
| REQ-221 | The clearing follows node dependencies across every scope and catalog, including earlier scope paths. | FR | accepted | S-054, S-104, S-140, S-141 | Clear a mixed parent summary and its catalog ancestors. Preserve its unaffected child notes and clean sibling subtree. | [sanitization.ts: redactionClosure](../../packages/core/src/domain/sanitization.ts#L175) |
| REQ-223 | A part above its budget merges one pair at a time, the pair with the highest `due`, until the count of lines fits the budget.                                                         | FR   | accepted | S-056, S-109, S-121 | A part above its budget holds no more lines than the budget.                                                                   | [tree.ts: frontier](../../packages/core/src/domain/tree.ts#L505) |
| REQ-244 | A write trims the ends of the `body` and turns each run of spaces into one space.                                                                                                     | FR   | accepted  | S-059               | A body of `a  b` becomes `a b`.                                                                                                | [note-body.ts: normalizeBody](../../packages/core/src/domain/note-body.ts#L32) |
| REQ-255 | A scope key holds two segments separated by a colon. Each segment starts with a lowercase letter or a digit, and it holds lowercase letters, digits, the period, the underscore, the slash, and the hyphen. | FR | accepted | S-063, S-108 | `project:dsh/optmem` is a scope key, and `project:dsh optmem` is not. | [scope.ts: moduleContract](../../packages/core/src/domain/scope.ts#L4) |
| REQ-259 | An address is `pos`, `pos-pos`, `scope#pos`, or `scope#pos-pos`.                                                                                                                      | FR   | accepted | S-063               | `2107`, `1024-2047`, and `project:dsh/optmem#4` are addresses.                                                                 | [address.ts: moduleContract](../../packages/core/src/domain/address.ts#L4) |
| REQ-273 | The tool strips one leading `#` from an address before the parse.                                                                                                                     | FR   | accepted | S-064               | `#1024-2047` gives the range `1024-2047`.                                                                                      | [address.ts: parseAddress](../../packages/core/src/domain/address.ts#L50) |
| REQ-275 | The render form of an address holds a leading `#`.                                                                                                                                    | FR   | accepted | S-064               | A slice line for record 2107 shows `#2107`.                                                                                    | [address.ts: renderAddress](../../packages/core/src/domain/address.ts#L129) |
| REQ-299 | The frontier tiles its range with no gap and no overlap. An empty range and a nested range do not render.                                                                             | FR   | accepted | S-067, S-121        | The sizes of the ranges sum to the whole, and a child range is not rendered again.                                             | [tree.ts: sparseBlocks](../../packages/core/src/domain/tree.ts#L431) |
| REQ-337 | A temporary line holds the period from the first live record to the last live record of its range, and no text. | FR | accepted | S-070, S-113, S-119, S-137 | A temporary line ignores hidden edges and gives no summary. | [tree.ts: slice](../../packages/core/src/domain/tree.ts#L537) |
| REQ-460 | The root range starts at 0 with level `max(1, ceil(log2(total)))` for positive `total`, and does not exist for zero. | FR | accepted | S-100, S-104, S-137 | One assigned position gives level 1. A sole live note at position 1023 gives level 10, even after 1023 hides. | [tree.ts: topRange](../../packages/core/src/domain/tree.ts#L269) |
| REQ-463 | The projection assigns catalog positions by the first real appearance of each profile scope in canonical event order, and keeps empty positions. | FR | accepted | S-100, S-104, S-139 | Merge independent scopes that both held position 2. Both import orders derive positions 2 and 3. The common prefix and empty scope positions survive. | [projection.ts: catalogTree](../../packages/core/src/domain/projection.ts#L419) |
| REQ-472 | A proposed event changes no record and takes no `pos`. The projection ignores it. | FR | accepted | S-101 | A proposal adds no record and no position. | [projection.ts: applyOperations](../../packages/core/src/domain/projection.ts#L271) |
| REQ-479 | The fold minimizes the demo jump penalty before comparing due, level, and start. | FR   | accepted | S-120, S-121, S-142 | Use the demo pair order even when no pair can keep every neighbor level within one step. | [tree.ts: selectMerge](../../packages/core/src/domain/tree.ts#L460) |
| REQ-480 | When no pair merges and the slice is above its budget, the oldest lines leave the slice.                                                                                              | FR   | accepted | S-120, S-121        | A small budget gives a slice that starts after the first positions.                                                            | [tree.ts: frontier](../../packages/core/src/domain/tree.ts#L505) |
| REQ-483 | A non-empty slice keeps its greatest non-empty leaf unfolded. | FR | accepted | S-120, S-123, S-137, S-138 | A scope ends with its last live note. A catalog ends with its last non-empty scope leaf. Hidden tail positions do not render. | [tree.ts: selectMerge](../../packages/core/src/domain/tree.ts#L460) |
| REQ-485 | The projection holds the records, the current node of each range, and the count of each scope.                                                                                        | FR   | accepted | S-126               | A store with three scopes holds the records, the nodes, and the three counts.                                                  | [projection.ts: project](../../packages/core/src/domain/projection.ts#L354) |
| REQ-492 | The projection holds the version of its schema, and the first version is 1.                                                                                                           | FR   | accepted | S-127               | A new store holds the version 1 in the projection.                                                                             | [projection.ts: project](../../packages/core/src/domain/projection.ts#L354) |
