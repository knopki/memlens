# 0013. The tree model

Status: accepted

## Context

A node is an event, and an import unions two logs by `id`. The import can move each `pos`. A field that
a build wrote is not enough to tell whether a node is valid. The slice needs a rule for a node that
the writer has not rebuilt yet.

## Decision

A node is `built` when the event of each child sits at its half of the range, and the check reads the
`pos` of each child. A node is `clean` when `input_rev` equals the revision of its two children. The
revision of a range is the order of the latest event that touches it. The store keeps no state field.

The slice is the frontier. The fold merges one pair at a time, the pair with the highest `due`, and it
keeps the level steps of the neighbours at one. It stops as soon as the count of lines is not above
the budget. A pair merges though its node is not built, and a temporary line takes the place of the
two lines. A temporary line holds the period from the first record to the last record of its range,
and no text. The last line is a record. When no pair merges and the slice is above its budget, the
oldest lines leave the slice. See [tree.d.ts](../spec/tree.d.ts).

## Alternatives

A dirty flag in the store. A tree that the store keeps. The cut of the oldest lines before the fold.

## Consequences

A read finds the revision by a descent to the built nodes, so the store keeps no state. An import that
moves the addresses makes each node above the first moved position not built. A rebuild appends an
event, and a repeated rebuild appends nothing.
