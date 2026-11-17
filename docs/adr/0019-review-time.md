# 0019. Review time

Status: accepted

## Context

`review_at` held a date, while every other time in the model is a full UTC time.
The date form gave an accidental same-day repeat rule, and the record held no date of its last change.
The customer names the mixed granularity a defect of the specification.

## Decision

`review_at` is a full time in the form of `at`. The due test is now or earlier.
A record with no review time is never due.
A record carries `modified_at`, the `at` of the latest event that affects it.
`recorded_at` stays the write time.
`modified_at` takes no part in the tree revision or the merge comparison, so a review makes no node dirty.
The log keeps older date values, and the text order of the two forms gives one comparison.

## Consequences

The projection schema version grows to 2. A store rebuilds its snapshot from the log on the first read.
The queue can grow inside a day. The display of lists stays date only.
