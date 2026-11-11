# Slices

The review for acceptance goes in slices. One slice is one part of the product that the customer can judge alone.
[02-requirements.md](02-requirements.md) holds global requirements and pending behavior.
The local contracts column links to implemented local rules. The count includes only the identifiers in the global requirements column.

The numbers are the requirement numbers: `010-014` means REQ-010 to REQ-014. The first five slices
are the data path, and they need no model call. A rejected requirement stays out of the review.

| Slice | Subject | Global requirements | Count | Local contracts |
| --- | --- | --- | --- | --- |
| 1 | The events and the notes | 008, 010, 013-014, 026-027, 060, 062, 064, 067-069, 074, 080-081, 277, 309, 474, 520-521 | 20 | [note-body](../../packages/core/src/domain/note-body.ts), [projection](../../packages/core/src/domain/projection.ts), [validation](../../packages/core/src/domain/validation.ts) |
| 2 | The projection | None | 0 | [projection](../../packages/core/src/domain/projection.ts) |
| 3 | The store | 043, 045, 175, 236, 306, 375, 484, 486, 488-491, 493-494 | 14 | [projection](../../packages/core/src/domain/projection.ts), [config](../../packages/core/src/domain/config.ts) |
| 4 | The redaction | 025, 082, 119, 219, 222 | 5 | [sanitization](../../packages/core/src/domain/sanitization.ts) |
| 5 | The transfer | 040, 057, 379, 384, 469, 510-513 | 9 | [commands](../../packages/cli/src/commands.ts), [export-md](../../packages/cli/src/export-md.ts) |
| 6 | The index | 041 | 1 | [fts](../../packages/core/src/storage/fts.ts) |
| 7 | The tree | 009 | 1 | [address](../../packages/core/src/domain/address.ts), [context](../../packages/core/src/domain/context.ts), [tree](../../packages/core/src/domain/tree.ts) |
| 8 | The compaction | 204, 218, 290, 464 | 4 | [tree](../../packages/core/src/domain/tree.ts), [compaction](../../packages/core/src/domain/compaction.ts), [publication](../../packages/core/src/storage/publication.ts) |
| 9 | The catalog | 108, 117 | 2 | [projection](../../packages/core/src/domain/projection.ts), [tree](../../packages/core/src/domain/tree.ts), [publication](../../packages/core/src/storage/publication.ts), [compaction](../../packages/core/src/domain/compaction.ts) |
| 10 | The scopes and the configuration | 031, 160, 270 | 3 | [scope](../../packages/core/src/domain/scope.ts), [projection](../../packages/core/src/domain/projection.ts), [context](../../packages/core/src/domain/context.ts), [config](../../packages/core/src/domain/config.ts), [active-scope](../../packages/core/src/domain/active-scope.ts) |
| 11 | The slice and the harness | 019-020, 188-189, 233, 235, 237, 241-242, 280, 285, 300, 377, 445 | 14 | [tree](../../packages/core/src/domain/tree.ts), [context](../../packages/core/src/domain/context.ts) |
| 12 | The agent tools | 023-024, 030, 039, 260-261, 276, 310, 343-344, 349-350, 352, 371, 477 | 15 | [address](../../packages/core/src/domain/address.ts), [reads](../../packages/core/src/domain/reads.ts), [tree](../../packages/core/src/domain/tree.ts), [errors](../../packages/core/src/types/errors.ts) |
| 13 | The subagents | 034, 158-159, 353-357, 359-360, 362-363, 441 | 13 | None |
| 14 | The command line | 411, 413 | 2 | [commands](../../packages/cli/src/commands.ts), [cli](../../packages/cli/src/cli.ts), [export-md](../../packages/cli/src/export-md.ts) |
| 15 | The console | 361, 423, 459, 514-519 | 9 | [console](../../packages/core/src/domain/console.ts), [host](../../packages/cli/src/ui.ts), [client](../../packages/ui/src/client.ts), [i18n](../../packages/ui/src/i18n.ts) |
| 16 | The plugin | 028, 427-428 | 3 | None |
| 17 | The repository | 001-004, 006-007, 429 | 7 | None |

## Rules

1. The customer accepts a slice. The status of each requirement in the slice becomes `accepted`.
2. A requirement with an objection becomes `disputed`. An open question holds the objection.
3. A change of a slice is a new statement in [../statements.md](../statements.md).
