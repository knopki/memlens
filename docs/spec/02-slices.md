# Slices

The review for acceptance goes in slices. One slice is one part of the product that the customer can judge alone.
[02-requirements.md](02-requirements.md) holds the global requirements and the pending behavior.
The local contracts column links to implemented local rules. The count includes only the identifiers in the global requirements column.

The numbers are the requirement numbers: `260-261` means REQ-260 and REQ-261.
A rejected requirement stays out of the review, and it is in [02-superseded.md](02-superseded.md).

| Slice | Subject | Global requirements | Count | Local contracts |
| --- | --- | --- | --- | --- |
| 1 | The repository and the packages | 001-004, 006-007, 429 | 7 | None |
| 2 | The notes and the addresses | 260-261, 310 | 3 | [address](../../packages/core/src/domain/address.ts), [notes](../../packages/core/src/store/notes.ts) |
| 3 | The scopes and the profiles | 160, 270, 350, 352 | 4 | [active-scope](../../packages/core/src/domain/active-scope.ts), [scope](../../packages/core/src/domain/scope.ts) |
| 4 | The slice and the context | 009, 019, 530, 537 | 4 | [context](../../packages/core/src/domain/context.ts), [tree](../../packages/core/src/domain/tree.ts), [reads](../../packages/core/src/store/reads.ts) |
| 5 | The one row store | 236, 375, 521-523, 526, 534-535 | 8 | [schema](../../packages/core/src/store/schema.ts), [slots](../../packages/core/src/store/slots.ts), [notes](../../packages/core/src/store/notes.ts) |
| 6 | The transfer and the merge | 524-525, 531-532 | 4 | [transfer](../../packages/core/src/store/transfer.ts), [clock](../../packages/core/src/store/clock.ts) |
| 7 | The redaction | 189, 527 | 2 | [notes](../../packages/core/src/store/notes.ts), [schema](../../packages/core/src/store/schema.ts) |
| 8 | The summary tree and the compaction | 204, 528-529 | 3 | [build](../../packages/core/src/store/build.ts), [view](../../packages/core/src/store/view.ts), [nodes](../../packages/core/src/store/nodes.ts) |
| 9 | The compaction host | 290, 459, 518 | 3 | [compact](../../packages/cli/src/compact.ts), [console](../../packages/core/src/domain/console.ts) |
| 10 | The agent surface | 020, 023-024, 027-028, 030-031, 034, 039, 158-159, 188, 233, 235, 237, 241-242, 280, 285, 300, 343-344, 349, 353-357, 359-361, 371, 377, 441, 477 | 35 | [config](../../packages/core/src/domain/config.ts), [context](../../packages/core/src/domain/context.ts), [proposals](../../packages/core/src/store/proposals.ts), [tools](tools.d.ts) |
| 11 | The console | 423 | 1 | [console](../../packages/core/src/domain/console.ts), [host](../../packages/cli/src/ui.ts) |
| 12 | The session import | 413 | 1 | [commands](../../packages/cli/src/commands.ts) |
| 13 | The harness contract | 427-428, 445 | 3 | [plugin](../../packages/dsh-plugin/src/index.ts) |

## Rules

1. The customer accepts a slice. The status of each requirement in the slice becomes `accepted`.
2. A requirement with an objection becomes `disputed`. An open question holds the objection.
