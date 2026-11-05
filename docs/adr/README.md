# Architecture decision records

Write an ADR for each area of decisions. The ADR holds the context and the decisions of the area
in a table. [../spec/04-decisions.md](../spec/04-decisions.md) is the index: one row for each
decision, with its status and its ADR.

## File name

`NNNN-short-title.md`. Use the next number. The title has 3 words maximum.

## Template

```markdown
# NNNN. Title

Status: draft | accepted | replaced by NNNN

## Context

What is true now. What limits the choice.

## Decision

The selected option, in one sentence.

## Alternatives

The other options, and the reason for the refusal.

## Consequences

What becomes easy. What becomes difficult. What a reader must know.
```

## Index

| ID   | Title             | Status   |
| ---- | ----------------- | -------- |
| 0001 | Spec process      | accepted |
| 0002 | Stack and build   | accepted |
| 0003 | Event log         | accepted |
| 0004 | Store             | accepted |
| 0005 | Tree and writer   | accepted |
| 0006 | Catalog           | accepted |
| 0007 | Scope and config  | accepted |
| 0008 | Slice and context | accepted |
| 0009 | Redaction         | accepted |
