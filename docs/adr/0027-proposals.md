# 0027. Proposals

Status: accepted. This record replaces 0012.

## Context

A subagent must not change the memory of its parent. The earlier design made a proposal an event
with a `proposed` modifier, and the store kept the event. The row store keeps no event, and a
proposal needs a row of its own.

## Decision

A proposal is one row of the `proposals` table. The row holds the scope, the op, the target, the
payload, the creation time, the expiry time, and one closed status. The default expiry is 30 days.

The subagent writes one proposal, and the answer names its id. The report of the parent lists the
proposals of its children with their ids and bodies. A human accepts or dismisses the proposal in the
console. The accept applies the payload and closes the row in one transaction. The parent applies a
suggestion through an ordinary write.

## Alternatives

A `proposed` flag on a note row. An accept tool for the agent. An event with an accept op.

## Consequences

The store holds no record state for a proposal. A reader sees a live record or no record. The store
closes an expired proposal with no human, and the console shows the open rows.
