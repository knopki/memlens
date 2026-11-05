# 0025. Review date

Status: accepted

## Context

S-013 gave two fields, and S-017 keeps the date of the next review.

## Decision

The note event holds `review_at` only, the date of the next review. The record holds no `reviewed_at` field.

## Alternatives

Keep `reviewed_at` as a second field.

## Consequences

The note event holds one date.
