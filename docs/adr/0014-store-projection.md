# 0014. Store projection

Status: accepted

## Context

The log is the source of truth, and the store keeps many records. A hundred thousand records give two
hundred thousand rows of the tree. A read that derives the view from the events scans the whole log,
and a render happens on each turn.

## Decision

The store keeps a projection of the log: the records, the current node of each range, and the count of
each scope. The projection holds the order of the last event that it applied.

The SQLite backend changes the projection in the append transaction. The JSONL backend changes the
projection after the append, so a read can find a gap. A read with a small gap replays the events after
the mark. A gap above 1 000 events gives a rebuild from the log.

The projection holds the version of its schema, and the first version is 1. A change of the shape
migrates the projection, and the store does not rebuild it from the log. A migration is one
transaction, and a failed migration leaves the earlier version.

A rebuild reads each event one time. The render of the view reads the projection and scans no event.

## Alternatives

A read from the log on each render. A projection in a separate file for both backends. A projection
that the writer builds in the background.

## Consequences

A read costs the lines of the view and not the events of the log. A crash of the JSONL backend can
leave a gap, and the next read repairs it. An import appends events, and the projection follows the
same rules. The projection derives from the log, so a lost projection costs one pass over the log and no
data. The store carries the schema version from the first release, so the first change of the shape is
a migration and no rebuild.
