# 0013. The tree model

Status: accepted. [0020 Storage pivot](0020-storage-pivot.md) replaces the revision fields with the
validity keys.

## Context

A field that a build wrote does not tell whether a node is valid. The node must check its exact
children, and a stale summary must not survive a write. The slice needs a rule for a range that no
build reached yet.

## Decision

The root range starts at zero and covers `total` assigned positions. Its level is
`max(1, ceil(log2(total)))` when `total` is positive. A total of zero gives no root range. Hidden and
deleted records keep their positions and count towards `total`.

A node is valid when each non-null child names the live record or the node at its exact half. A null
child means that the half has no live record. A missing summary of a non-empty half is not an empty
child. Two empty halves need no node. With one non-empty half, the parent copies its text and dates
with no model call. The write path deletes each node over a changed slot.

The slice is the frontier. The fold merges the minimum number of pairs while the rendered line count
exceeds the budget, one pair at a time. The choice minimizes the jump penalty, then compares `due`,
the level, and the start. A pair merges though its node is missing or dirty, and a temporary line
takes the place of the two lines. The render calls no model. Empty ranges do not render and do not
count against the budget.

A temporary line holds the period from its first live record to its last live record. The render
joins the text of its two children and cuts the result at the line limit. A non-empty slice ends
with the greatest live position as a record. No merge covers that position. When no pair merges and
the slice is above its budget, the oldest lines leave the slice.

## Alternatives

A dirty flag in the store. A tree that the store rebuilds on each read. The cut of the oldest lines
before the fold.

## Consequences

A write makes the covering nodes invalid, and a rebuild publishes one node row. The `due` value
orders both the fold and the compaction candidates.
