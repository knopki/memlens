# 0063. Wildcard key

Status: accepted

## Context

A profile that lists a family of scopes needs one form, and the kind can be part of the family. A key with a capital letter must not make a second scope.

## Decision

The part `*` of a scope key stands in the kind or in the name, and it matches any text of that part. The key `*` matches each scope. The store lowercases a scope key before the write.

## Alternatives

A wildcard in the name only. A refusal of a key with a capital letter.

## Consequences

One key covers a whole family, and a case typo adds no scope.
