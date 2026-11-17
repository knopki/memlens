# 0012. Proposals

Status: accepted

## Context

An agent can propose a note or a change. A subagent must not change the memory of its parent. The
earlier rule gave a proposed note the state `proposed`, and an `accept` event made the note live. The
customer described a simpler form, but a later rule added the field
`accepts` to a decision write. That field made a second event form for one operation.
A later correction changes the model: `proposed` is a modifier, not an event kind or a
record state.

## Decision

A proposal is an ordinary write op with `proposed: true`. The ops are `note`, `amend`, `hide`, and
`review`. The optional modifier is absent on `redact`, `dismiss`, `node`, and `invalidate`. The log has
no proposal op, no `accept` op, and no decision event.

The projection ignores an event with `proposed: true`. The event changes no record and takes no `pos`.
A write with no `proposed` field applies its op as usual.

A human approves a proposal when the human writes the ordinary op with no `proposed` field. The same
logical transaction closes the original proposal with `dismiss`. The `target` of that `dismiss` is the
id of the proposed event. The event has no second proposal id. The reason is `accepted`, and the schema
has no acceptance field.

A parent agent can write a note with the existing field `supersedes` to propose a correction. The note
tool needs no target field for a proposal.

## Alternatives

An `accept` event that names a proposal, and a projection that applies the op at the accept. A proposed
note with the state `proposed` and an `accept` event, as the earlier rule. A decision write with the
field `accepts`. A separate store of proposals.

## Consequences

The projection has one filter and no correlation between events. A proposal takes no position and creates no empty slot. A rejection of a `hide` or of a new note writes a `dismiss`, because the op has
no old value. The console lists the proposals of the log. The parent accepts a proposal with a normal
write. See [REQ-360](../spec/archive/02-requirements.md), [REQ-361](../spec/archive/02-requirements.md),
[REQ-474](../spec/archive/02-requirements.md), and [0020 Storage pivot](0020-storage-pivot.md).
