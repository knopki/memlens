# 0041. Dirty marks

Status: accepted

## Context

S-030 gives the dirty rule, and S-040 gives `due` as one order for the fold and the rebuild.

## Decision

The rebuild follows the dirty marks. A node is dirty when a source changes or becomes dirty, and an import that changes the order makes the tree dirty. The writer and the fold take the work in one order. A node waits for its children.

## Alternatives

Keep a measure of overdue for the order of the work.

## Consequences

The work follows the changes. A node waits for its children. A merge can make the whole tree dirty.
