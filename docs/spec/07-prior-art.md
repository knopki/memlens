# Prior art, compared with the code

The customer gave a table of seven implementations. The table is the source of [S-014](../statements.md).
This file compares each claim with the code in `../optmem-test-drive/refs` on 2026-11-04. A claim has
one verdict: confirmed, imprecise, or unverified.

An unverified claim stays a claim. Do not build a requirement on it.

## OptMem

| Claim                                         | Evidence                                                                    | Verdict   |
| --------------------------------------------- | --------------------------------------------------------------------------- | --------- |
| The log record is 320 bytes.                  | `VictorTaelin_OptMem/memo:72` `LOG_REC = 320`                               | confirmed |
| The tree uses files `TREE/<2^k>`.             | `memo:73` `TREE_REC = 288`. `memo:214` `os.path.join(d, "TREE", str(size))` | confirmed |
| `wake` prints at most 96 lines.               | `memo:51` `"WAKE_LINES": (96, ...)`                                         | confirmed |
| `wake` blocks while compressions are pending. | `memo:610-612` prints the next nap and calls `sys.exit(1)`                  | confirmed |
| The agent makes the naps.                     | `memo:7` nap is a command. `memo:463` `nap_prompt`                          | confirmed |
| `forget` only drops a node.                   | `memo:10` "drop a bad summary". The next nap rebuilds it                    | confirmed |
| The search is a regular expression.           | `memo:529` "`recall <regex>` searches every memory"                         | confirmed |
| The tool is 859 lines.                        | `wc -l memo` gives 859                                                      | confirmed |

## uniichat

| Claim                                   | Evidence                                                                                          | Verdict                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `NODE = 512`, `TRIES = 5`, `JOBS = 64`. | `Memory.ts:142-144`                                                                               | confirmed                                                                           |
| The view goes from 128 KB to 32 KB.     | `Memory.ts:147` `HIGH = 128000` with the comment "merges to half". `Memory.ts:148` `SEEN = 32000` | imprecise. The merge goes to half, that is 64 KB. The 32 KB value is another limit. |
| The writer takes the most overdue pair. | `Memory.ts:897-901`                                                                               | confirmed                                                                           |
| The writer retries by the length ruler. | `Memory.ts:167-185`, `Memory.ts:727-742`                                                          | confirmed                                                                           |
| A line carries the mark `id+n`.         | `Memory.ts:992`                                                                                   | confirmed                                                                           |
| The file is 1194 lines.                 | `wc -l Memory.ts` gives 1194                                                                      | confirmed                                                                           |

## pi-optmem

| Claim                                                          | Evidence                                                                                     | Verdict   |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------- |
| The memory sits in the prompt and stays fixed for the session. | `index.ts:11` "Runs `memo wake` at session start and puts the memory in the system [prompt]" | confirmed |

## pi-optchat (jonaslsaa)

| Claim                                     | Evidence                                                                         | Verdict   |
| ----------------------------------------- | -------------------------------------------------------------------------------- | --------- |
| The background compactor runs 8 jobs.     | `src/memory.ts:126` `jobs = 8`. `src/settings.ts:27` "Chat itself always runs 8" | confirmed |
| A line must shrink its source.            | `src/compactor.ts:81` "a line must also shrink what it replaces"                 | confirmed |
| One call primes the cache for the others. | `src/compactor.ts:17`                                                            | confirmed |
| The project has 14 k lines.               | 12,111 lines in the `*.ts` files                                                 | imprecise |

## pi-optchat (biowaffeln)

| Claim                                                       | Evidence           | Verdict   |
| ----------------------------------------------------------- | ------------------ | --------- |
| A session is a branch, and the branches merge into a trunk. | `docs/branches.md` | confirmed |

## elephant-memory

| Claim                                                                         | Evidence                                 | Verdict   |
| ----------------------------------------------------------------------------- | ---------------------------------------- | --------- |
| The view ceiling is 256 KB and the floor is 128 KB.                           | `README.md:318-319`, `README.md:424-425` | confirmed |
| The writer makes 6 lines in a batch.                                          | `README.md:323` `writer.batch` = 6       | confirmed |
| The writer accepts a line up to 1.25 times the limit.                         | `README.md:503-506` "640 bytes at 512"   | confirmed |
| The writer gets three tries, not five.                                        | `README.md:503-506`                      | confirmed |
| A retry asks for 0.75 of the limit.                                           | `README.md:275`, `README.md:506`         | confirmed |
| 27.5 % of the lines stay over 512 bytes.                                      | `README.md:505` "325 of 1,182 lines"     | confirmed |
| The 90th percentile is 610 bytes.                                             | `README.md:535`                          | confirmed |
| Higher effort costs a median of 8,800 output tokens and waits of two minutes. | `README.md:512`                          | confirmed |
| The writer effort is off by default.                                          | `README.md:511`                          | confirmed |

## pi-durable-memory

| Claim                                        | Evidence                                                                    | Verdict   |
| -------------------------------------------- | --------------------------------------------------------------------------- | --------- |
| The memory has scopes.                       | `README.md:3`, `README.md:46`, `README.md:63`. 122 uses of `scope` in `src` | confirmed |
| An import is idempotent by `sourceId`.       | 13 uses of `sourceId` in `src`                                              | confirmed |
| A note can supersede another note.           | 36 uses of `supersedes` in `src`                                            | confirmed |
| The section stays frozen for one run.        | `README.md:88` "renders this section once per run and reuses it"            | confirmed |
| A script measures the stability of the view. | `README.md:189`, `scripts/view-stability.mjs`                               | confirmed |

## ai-memory

The reference directory has no copy of this project. The contrast row of the table stays unverified.
