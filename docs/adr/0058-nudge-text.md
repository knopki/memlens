# 0058. Nudge text

Status: accepted

## Context

One text serves each mode, and `{n}` holds tool calls in `tools`, turns in `turns`, or steps in `expensive`. A text with `tool calls` lies in two modes.

## Decision

The default text of the nudge names no unit: `[memory] {n} steps since the last record. Anything durable: a decision, a correction, a preference, a failed attempt and its cause?`

## Alternatives

Keep `{n} tool calls` and ask the profile to set `text`. Drop `{n}`.

## Consequences

The default text is true in each mode. A profile can still give its own text. The default keeps `{n}`.
