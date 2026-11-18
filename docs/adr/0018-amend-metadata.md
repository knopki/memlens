# 0018. Amend metadata

Status: accepted.

## Context

The `amend` operation changed the body, the document, and the scope of a note.
The `kind` of a note is metadata. It changes no content and no date.
A review can find that a note replaces an earlier note. The write that found this case needs a new note.

## Decision

An amendment carries optional `kind` and `supersedes` fields.
The record takes the new kind. The write date, the review date, and the content stay.
A supersede link sits on the target as `superseded_by`, and the target keeps its first link. One note
holds one link, not a list. An amendment adds a link to a target that holds none.
The store applies the note rules to each new target.
The target is an ordinary note of the same scope.
The target becomes hidden, and the first `superseded_by` value stays.
The sanitized form of an amendment keeps `kind` and `supersedes`.
An accepted proposal applies the fields by the ordinary write rules.

## Alternatives

A new note that replaces both notes. It adds a record and hides the history of the earlier note.
A separate metadata event. It adds an operation for two optional fields.

## Consequences

The event schema gains two optional fields on one operation.
The target leaves the view at the amendment, and the link stays on the target.
The console form and the command line expose both fields.
A kind change starts no review period and changes no tree node.
