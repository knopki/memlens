# 0039. Summary limit

Status: accepted

## Context

A summary covers more than one note, so it needs more room than the 384-byte note body.

## Decision

A summary line targets 512 bytes and stops at 640 bytes.

## Alternatives

Use the note body limits for a summary. Set no limit for a summary.

## Consequences

One summary costs about 512 bytes of the slice. A line above 640 bytes is over the limit.
