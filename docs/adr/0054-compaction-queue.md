# 0054. Compaction queue

Status: accepted

## Context

S-051 gives the queue and the four triggers. D-019 gave up to 8 jobs in parallel, and this statement gives 6 calls. NG-006 and NG-007 exclude a blocking wake and work in the agent loop.

## Decision

The compaction runs outside the agent loop. The store keeps the queue of the jobs. A worker holds a job under a lease of 120 seconds, and a failed job waits 10, 60, then 300 seconds. A run takes one form: 6 calls of one line, or one call of 6 lines. The wake does not wait for the queue.

## Alternatives

Work in the agent loop. A separate service. A blocking wake.

## Consequences

A crash returns a job after the lease. The wake can give the view with the raw records. The check of `gen` refuses a result over a changed input. The count of the calls changes from D-019.
