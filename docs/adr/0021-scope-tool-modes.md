# 0021. Scope tool modes

Status: accepted

## Context

The context text holds the direction lines of the visible scopes and the frontier of the active
scope. The other scopes hold keys only, and a key alone gives no next step. A scope above the
`directions` budget holds a comma list of keys and no summary.

## Decision

The tool `memory_map` takes an optional `scope`. Without a value it gives the direction lines.
With a value it gives the frontier lines of that scope. A subagent gets the tool. The tool sets no
active scope, and it gives no `next` value.

## Alternatives

Two tools: one for the list, one for the tree slice. The list alone gives no next step, and the two
answers serve one question. A `scope` target in `memory_open` with no range. `memory_open` gives a
record or a node, and a third shape blurs one read. No tool for a subagent. A word in `memory_find`
is the only path to a note of another scope.

## Consequences

The agent lists the scopes, takes one tree slice, and opens a range. The tool answer and the slice
share one render. A key outside the profile gives `NotAllowed`. The child holds four tools. The tool
reads rows only, so a subagent calls it without a proposal.
