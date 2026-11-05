# 0043. Scope rename

Status: accepted

## Context

S-033 refuses the alias as a second name for one scope, and the customer gives `amend` for a wrong key.

## Decision

A wrong key of a scope changes by an `amend` of the record. The model has no alias map.

## Alternatives

An alias map in the configuration. A rewrite of the events of the old key.

## Consequences

One name for one scope. A value stays in the event. A full rename costs one amend for each record.
