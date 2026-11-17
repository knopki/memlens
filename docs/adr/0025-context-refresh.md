# 0025. Context refresh

Status: accepted

## Context

The harness appends a changed runtime context as a new user message at the session end. The session prefix stays unchanged, so the prompt cache stays intact. The premise of [0007 Slice and context](0007-slice-context.md), a stable text protects the prompt cache, is wrong. A changed snapshot costs one more slice copy in the session history, nothing else.

The customer showed the harness behavior on 2026-11-17 and selected option B of Q-526.

## Decision

The context text changes at a session start and at a successful compaction only.
The plugin installs no idle timer and tracks no session activity for the context.

## Alternatives

Keep the idle trigger with an honest motivation. The interval limits how often a new snapshot copy enters the history, and fresh notes reach the agent with no compaction. The customer refused this option.

## Consequences

A note written during a session reaches the agent context after the next compaction or at the next session. The context code holds no timer, no activity stamp, and no model route read.
