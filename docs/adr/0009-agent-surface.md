# 0009. Agent surface

Status: accepted

## Context

The agent writes and reads notes. A subagent must not change the parent memory without a human. A human needs a way to accept a proposal.

## Decision

The main agent has six tools. A subagent gets `memory_find`, `memory_open`, `memory_note`, and a slice, and its writes are `proposed`. The parent gets one line for each proposal. A human accepts or dismisses in the console. `memory_open` stops at 4096 nodes and 24 KiB.

## Alternatives

An `accept` tool. A `hide` tool for a subagent. An unlimited `memory_open`. No proposals.

## Consequences

An unaccepted proposal gets a `dismiss` after 30 days. The subagent has three tools. The open answer continues with `offset` and `next`.
