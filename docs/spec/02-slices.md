# Slices

The review for acceptance goes in slices. One slice is one part of the product that the customer can judge alone.
[02-requirements.md](02-requirements.md) holds global requirements and pending behavior.
The local contracts column links to implemented local rules. The count includes only the identifiers in the global requirements column.

The numbers are the requirement numbers: `010-014` means REQ-010 to REQ-014. The first five slices
are the data path, and they need no model call. A rejected requirement stays out of the review.

| Slice | Subject | Global requirements | Count | Local contracts |
| --- | --- | --- | --- | --- |
| 1 | The events and the notes | 008, 010, 013-014, 026-027, 059-069, 071-072, 074, 079-081, 083, 085, 238-240, 277, 307, 309, 370, 474, 495-496 | 35 | [note-body](../../packages/core/src/domain/note-body.ts), [projection](../../packages/core/src/domain/projection.ts) |
| 2 | The projection | None | 0 | [projection](../../packages/core/src/domain/projection.ts) |
| 3 | The store | 042-045, 148, 174-175, 236, 306, 372-376, 467, 471, 484, 486-491, 493-494, 504 | 26 | [projection](../../packages/core/src/domain/projection.ts) |
| 4 | The redaction | 025, 082, 119, 219, 222 | 5 | [sanitization](../../packages/core/src/domain/sanitization.ts) |
| 5 | The transfer | 040, 057, 077, 378-379, 381-384, 466, 469, 505-508, 510-513 | 19 | None |
| 6 | The index | 041, 311-316, 448-450, 476 | 11 | None |
| 7 | The tree | 009, 022, 049-050, 124, 132, 135-137, 139, 169-170, 172-173, 176, 442, 482 | 17 | [tree](../../packages/core/src/domain/tree.ts) |
| 8 | The writer | 033, 051, 053-054, 127, 202-204, 209-210, 212-214, 218, 247, 249-251, 253-254, 290, 432-438, 464, 468 | 30 | [tree](../../packages/core/src/domain/tree.ts) |
| 9 | The catalog | 016, 108-110, 113-117, 121, 145, 192, 439, 451, 461 | 15 | [projection](../../packages/core/src/domain/projection.ts), [tree](../../packages/core/src/domain/tree.ts) |
| 10 | The scopes and the configuration | 031, 146, 149, 151, 154-156, 160, 187, 216, 232, 252, 262-266, 268-270, 272, 278, 286, 291, 457 | 25 | [scope](../../packages/core/src/domain/scope.ts), [projection](../../packages/core/src/domain/projection.ts) |
| 11 | The slice and the harness | 017, 019-020, 038, 188-189, 205, 233, 235, 237, 241-242, 280, 285, 297-298, 300, 377, 445, 453-454, 475, 509 | 23 | [tree](../../packages/core/src/domain/tree.ts) |
| 12 | The agent tools | 023-024, 030, 039, 228-229, 260-261, 276, 310, 319, 325-328, 342-344, 349-350, 352, 368, 371, 477, 497-499 | 27 | [address](../../packages/core/src/domain/address.ts), [tree](../../packages/core/src/domain/tree.ts), [errors](../../packages/core/src/types/errors.ts) |
| 13 | The subagents | 034, 158-159, 353-357, 359-360, 362-363, 441 | 13 | None |
| 14 | The command line | 046, 385-386, 411-416, 458, 500-503 | 14 | None |
| 15 | The console | 361, 417-419, 423, 459 | 6 | None |
| 16 | The plugin | 028, 427-428 | 3 | None |
| 17 | The repository | 001-004, 006-007, 429 | 7 | None |

## Rules

1. The customer accepts a slice. The status of each requirement in the slice becomes `accepted`.
2. A requirement with an objection becomes `disputed`. An open question holds the objection.
3. A change of a slice is a new statement in [../statements.md](../statements.md).
