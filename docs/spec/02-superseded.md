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
| REQ-440 | The direction line starts with `[<key>] `. | FR | S-089 | REQ-297 |
| REQ-455 | With both keys, the template of `customPrompt` holds the append text at `{{append}}`. | FR | S-103 | REQ-454 |
| REQ-225 | The compression of `<here>` keeps at least 60 percent of the budget. | FR | S-056 | No requirement. |
