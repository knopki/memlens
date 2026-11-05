# 0069. Proposals

Status: accepted

## Context

S-070 gives the delivery and the fate of a proposal, and it gives no accept tool.

## Decision

A subagent write is always `proposed`. The proposals of one child collect under its session id, and the report of the parent gets one line for each. A human accepts or dismisses a proposal in the console. An unaccepted proposal gets a `dismiss` after 30 days, and the event log keeps its content.

## Alternatives

An accept tool for the agent. An automatic accept at the session end.

## Consequences

An agent accepts no own proposal. The parent accepts with a normal `memory_note`. A dismissed proposal stays in the log only. REQ-353 to REQ-363 hold the rules.
