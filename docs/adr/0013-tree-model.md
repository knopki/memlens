# 0013. The tree model

Status: accepted. [0020 Storage pivot](0020-storage-pivot.md) replaces the revision fields with the validity keys.

## Context

A node is an event, and an import unions two logs by `id`. The import can move each `pos`. A field that
a build wrote is not enough to tell whether a node is valid. The slice needs a rule for a node that
the writer has not rebuilt yet.

## Decision

The root range starts at zero and covers `total` assigned positions. Its level is `max(1, ceil(log2(total)))` when `total` is positive.
A total of zero gives no root range. Hidden and deleted records keep their positions and count towards `total`.

A node is `built` when each non-null child names the live record or node at its exact half.
A null child means that the half has no live record. A missing summary of a non-empty half is not an empty child.
Two empty halves need no node event. With one non-empty half, the parent copies its text and dates without a model call.
The current compaction rule uses a model when a leaf has a `longform`. See [Compaction](../spec/06-architecture.md#compaction).
This rule also builds a partial root, whose other half can extend beyond `total`.
The store builds a clean node with no invalidation, and it has clean child nodes. Its child revision must equal `input_rev`.
An import can change the input without a change of the maximum order. The revision equality alone does not prove freshness.
[0015 Node invalidation](0015-node-invalidation.md) defines durable invalidation and the writer check.

The slice is the frontier. The fold merges the minimum number of pairs. It runs only while the
rendered line count exceeds the budget, and it stops at once when the count fits. It merges one pair
at a time. The choice minimizes the demo jump penalty, then compares due, level, and start.
A pair merges though its node is missing or dirty, and a temporary line takes the place of the two
lines. The render calls no model. Empty ranges do not render or count against the budget.

A temporary line holds the period from its first live record to its last live record, and no text.
A non-empty slice ends with the greatest live position as a record. No merge covers that position. When no pair merges and the slice is above its budget, the
oldest lines leave the slice. [S-142](../statements.md#s-142) gives the minimal fold and the
temporary line. See [tree.d.ts](../spec/tree.d.ts).

## Alternatives

A dirty flag in the store. A tree that the store keeps. The cut of the oldest lines before the fold.

## Consequences

The projection derives the invalidated ids from the log. An import that moves an address makes each affected node not built. A rebuild appends an
event, and a repeated rebuild appends nothing. The writer derives its candidates from dirty non-empty
ranges up to the root, including ranges with no node event. This candidate list is ephemeral.
