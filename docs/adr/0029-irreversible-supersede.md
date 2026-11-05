# 0029. Irreversible supersede

Status: accepted

## Context

Two notes can supersede one target, and each order of arrival must give one result.

## Decision

The supersede is irreversible. A target never leaves the state `hidden`, and `superseded_by` can name a hidden note.

## Alternatives

Cancel the supersede when the other note hides. Give the field to the newest note.

## Consequences

The state stays monotone. The first note keeps the field. A reader does not need the state of the other note.
