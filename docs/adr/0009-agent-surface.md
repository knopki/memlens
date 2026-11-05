# 0009. Agent surface

Status: accepted

## Context

The agent writes and reads notes. A subagent must not change the parent memory without a human. A human needs a way to accept a proposal.

## Decision

The main agent has six tools. A subagent gets `memory_find`, `memory_open`, `memory_note`, and a slice, and its writes are `proposed`. The parent gets one line for each proposal. A human accepts or dismisses in the console. `memory_open` stops at 4096 nodes and 24 KiB.

- 0047: The subagent mode sets the access of a subagent.
- 0066: The agent surface is `memory_find`, `memory_open`, `memory_note`, and `memory_forget`.
- 0068: The descent of `memory_open` stops at a working budget of 4096 visited nodes and at an answer of 24 KiB.
- 0069: A subagent write is always `proposed`.
- 0070: The agent surface is `memory_find`, `memory_open`, `memory_note`, `memory_forget`, `memory_review`, and `memory_scope`.

## Alternatives

An `accept` tool. A `hide` tool for a subagent. An unlimited `memory_open`. No proposals.

## Consequences

An unaccepted proposal gets a `dismiss` after 30 days. The subagent has three tools. The open answer continues with `offset` and `next`.
