# Superseded requirements

A later requirement replaces each item in this file. The item stays for the record, and it is not
live. The live rule is in [02-requirements.md](02-requirements.md).

| ID | Requirement | Type | Source | Replaced by |
| --- | --- | --- | --- | --- |
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
