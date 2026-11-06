# 0012. Proposals

Status: accepted

## Context

An agent can propose a note, and a subagent must not change the memory of its parent. The earlier rule
gave a proposed note the state `proposed`, and an `accept` event made the note live. A proposal to
change an existing record had no rule: the state named the record, not the change. A record has no
field for a pending change.

## Decision

A proposal is a write op with the field `proposed`. The ops are `note`, `amend`, `hide`, and `review`.
The projection ignores a proposed event: it changes no record and takes no `pos`. A decision is a
write op with no proposal and the field `accepts`, the id of the proposal. The decision applies as a
normal op. A `dismiss` names a proposal and closes it. It changes no record. The log holds no
`accept` op, and the state of a record is `live`, `hidden`, or `deleted`.

## Alternatives

An `accept` event that names a proposal, and a projection that applies the op at the accept. A
proposed note with the state `proposed` and an `accept` event, as the earlier rule. A separate store
of proposals.

## Consequences

The projection has one filter and no correlation between events. A proposal takes no position, so the
geometry stays dense. A rejection of a `hide` or of a new note writes a `dismiss`, because the op has
no old value. The console lists the proposals of the log. The parent accepts a proposal with a normal
write. See [REQ-472](02-requirements.md) to [REQ-474](02-requirements.md).
