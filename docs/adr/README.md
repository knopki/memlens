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
| 0002 | Event log | replaced by 0020 |
| 0003 | Store | replaced by 0020 |
| 0004 | Tree and writer | accepted |
| 0005 | Catalog | replaced by 0011 |
| 0006 | Scope and config | accepted |
| 0007 | Slice and context | accepted |
| 0008 | Redaction | accepted |
| 0009 | Agent surface | accepted |
| 0010 | Process and stack | accepted |
| 0011 | Nodes are events | replaced by 0020 |
| 0012 | Proposals | accepted |
| 0013 | Tree model | accepted |
| 0014 | Store projection | replaced by 0020 |
| 0015 | Node invalidation | replaced by 0020 |
| 0016 | Write boundary | accepted |
| 0017 | Store publication | replaced by 0020 |
| 0018 | Amend metadata | accepted |
| 0019 | Review time | accepted |
| 0020 | Storage pivot | accepted |
| 0021 | Scope tool modes | accepted |
| 0022 | Plugin configuration | accepted |
| 0023 | Batch compaction | accepted |
| 0024 | LikeC4 model | accepted |

The decision texts of 2026-11-10 call the compaction the writer. The product renamed the term on 2026-11-11, and the texts stay as decided.

ADR 0002, 0003, 0011, 0014, 0015, and 0017 describe the event store. [0020](0020-storage-pivot.md) replaces them.
ADR 0001, 0004, 0008, 0013, and 0016 stay accepted, and 0020 replaces their event mechanism.
[0023](0023-batch-compaction.md) replaces the run form of 0004 and removes the key `mode`.
