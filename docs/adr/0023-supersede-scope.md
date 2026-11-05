# 0023. Supersede scope

Status: accepted

## Context

A note in `project:work` must not hide a note in `global:prefs`, where the agent has no write permission.

## Decision

A `supersedes` stays inside one scope. The store refuses a cross-scope supersede with the error `CrossScopeSupersede`.

## Alternatives

Allow each cross-scope supersede. Allow it for a user who owns both scopes.

## Consequences

A user who needs the effect writes a note in the other scope. The view of each scope stays predictable.
