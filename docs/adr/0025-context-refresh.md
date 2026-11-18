# 0025. Context refresh

Status: accepted

## Context

The harness appends a changed runtime context as a new user message at the session end. The session
prefix stays unchanged, so the prompt cache stays intact. A stable text does not protect the prompt
cache, and a changed snapshot costs one more copy in the session history.

## Decision

The context text changes at a session start and at a successful compaction only.
The plugin installs no idle timer and tracks no session activity for the context.

## Alternatives

Keep the idle trigger: the interval limits how often a new copy enters the history, and fresh notes
reach the agent with no compaction.

## Consequences

A note written during a session reaches the agent context after the next compaction or at the next session. The context code holds no timer, no activity stamp, and no model route read.
