# 0009. Agent surface

Status: accepted.

## Context

The agent writes and reads notes. A subagent must not change the memory of its parent. A human needs
a way to accept a suggestion. Each caller needs one tool list of its own.

## Decision

The plugin registers the memory tools in the context of each agent. The tools are `memory_note`,
`memory_find`, `memory_open`, `memory_map`, `memory_forget`, and `memory_review`.
A target outside the scopes of the profile gives the error `NotAllowed`. Only the CLI and the console
amend, redact, accept, and dismiss.

The profile mode selects the tools of a subagent. The mode `propose` gives `memory_find`,
`memory_open`, `memory_note`, and `memory_map`, and each write becomes a proposal. The mode `read`
gives the reading tools only. The mode `off` gives no tool and no context.

The answer of a subagent write names the proposal id. The report of the parent lists the proposals of
its children with their ids and bodies. A human accepts or dismisses a proposal in the console. The
parent applies a suggestion through an ordinary write.

## Alternatives

An `accept` tool for the agent. A `hide` tool for a subagent. One tool list for each caller.

## Consequences

A subagent answer holds no live record. Each proposal waits for a human or for an ordinary write of
the parent. The store dismisses an expired proposal with no human.
