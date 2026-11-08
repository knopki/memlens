# Slices

The review for acceptance goes in slices. One slice is one part of the product that the customer can
judge alone. The status of each requirement is in [02-requirements.md](02-requirements.md).

The numbers are the requirement numbers: `010-014` means REQ-010 to REQ-014. The first five slices
are the data path, and they need no model call. A rejected requirement stays out of the review.

| Slice | Subject | Requirements | Count |
| ----- | ------- | ------------ | ----- |
| 1 | The events and the notes | 008, 010-014, 026-027, 037, 058-069, 071-072, 074-076, 079-081, 083-085, 238-240, 244, 277, 307, 309, 370, 472-474 | 43 |
| 2 | The projection | 086-093, 096, 098-106 | 18 |
| 3 | The store | 042-045, 148, 174-175, 236, 306, 372-376, 467, 471 | 16 |
| 4 | The redaction | 025, 078, 082, 119, 219-222 | 8 |
| 5 | The transfer | 040, 057, 077, 378-379, 381-384, 466, 469 | 11 |
| 6 | The index | 041, 311-316, 448-450, 476 | 11 |
| 7 | The tree | 009, 022, 048-050, 122-126, 129-140, 161-173, 176-177, 207, 217, 299, 442, 462, 465, 470 | 44 |
| 8 | The writer | 033, 051, 053-054, 127, 200-204, 209-215, 218, 247, 249-251, 253-254, 290, 432-438, 464, 468 | 34 |
| 9 | The catalog | 016, 073, 108-110, 113-117, 120-121, 145, 191-192, 439, 451, 460-461, 463 | 20 |
| 10 | The scopes and the configuration | 031, 142-144, 146, 149, 151, 154-156, 160, 187, 216, 232, 252, 255, 262-266, 268-270, 272, 278, 286, 291, 457 | 29 |
| 11 | The slice and the harness | 017, 019-020, 038, 188-189, 205-206, 208, 223, 233, 235, 237, 241-242, 280, 285, 297-298, 300, 377, 445, 453-454, 475 | 25 |
| 12 | The agent tools | 023-024, 030, 039, 228-229, 259-261, 273, 275-276, 310, 319, 325-328, 337, 342-344, 349-350, 352, 368, 371, 477 | 28 |
| 13 | The subagents | 034, 158-159, 353-357, 359-360, 362-363, 441 | 13 |
| 14 | The command line | 046, 385-386, 411-416, 458 | 10 |
| 15 | The console | 361, 417-419, 423, 459 | 6 |
| 16 | The plugin | 028, 427-428 | 3 |
| 17 | The repository | 001-004, 006-007, 429 | 7 |

## Rules

1. The customer accepts a slice. The status of each requirement in the slice becomes `accepted`.
2. A requirement with an objection becomes `disputed`. An open question holds the objection.
3. A change of a slice is a new statement in [../statements.md](../statements.md).
