# 0057. Nudge cache

Status: accepted

## Context

A nudge inside the slice changes the cached prefix at each turn. A fuzzy dedup would hide a correction.

## Decision

The nudge is one line after the frozen slice, so the cached prefix stays put. A write creates no record when a live note of the same scope holds the normalized `body`, `longform`, `kind`, and `review_at`, and the write has no `supersedes`. In the mode `expensive`, a long turn demands a write before its end.

## Alternatives

The nudge inside the slice. A semantic dedup. No dedup.

## Consequences

The cache stays warm. A repeated write costs one call and no record. A correction with one changed word makes a new note.
