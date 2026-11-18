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


## Consequences

The store holds a full time for each review date, and the due test is one comparison. A record with
no review time is never due. A review moves `modified_at` and no node row. The display of a list
stays date only.
