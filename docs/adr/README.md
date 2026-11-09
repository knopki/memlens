# Architecture decision records

Write an ADR for each decision. The record holds the context, the decision, the alternatives, and
the consequences.

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

| ID   | Title | Status |
| ---- | ----- | ------ |
| 0001 | Memory model | accepted |
| 0002 | Event log | accepted |
| 0003 | Store | accepted |
| 0004 | Tree and writer | accepted |
| 0005 | Catalog | replaced by 0011 |
| 0006 | Scope and config | accepted |
| 0007 | Slice and context | accepted |
| 0008 | Redaction | accepted |
| 0009 | Agent surface | accepted |
| 0010 | Process and stack | accepted |
| 0011 | Nodes are events | accepted |
| 0012 | Proposals | accepted |
| 0013 | Tree model | accepted |
| 0014 | Store projection | accepted |
| 0015 | Node invalidation | accepted |
