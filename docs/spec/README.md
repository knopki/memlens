# Specification for memlens

## Purpose

This directory is the only authority for requirements. It tells what memlens does, for whom, and
what memlens does not do. Statements come in portions. Each statement becomes a testable
requirement.

## Files

| File                                         | Content                                            | Status       |
| -------------------------------------------- | -------------------------------------------------- | ------------ |
| [00-overview.md](00-overview.md)             | Problem, users, value, success criteria.           | live         |
| [01-goals-nongoals.md](01-goals-nongoals.md) | Goals, non-goals, constraints.                     | live         |
| [02-requirements.md](02-requirements.md)     | Requirements with identifiers and status.          | live         |
| [02-superseded.md](02-superseded.md)         | Requirements that a later requirement replaced.     | archive      |
| [02-slices.md](02-slices.md)                 | The review order for acceptance, in slices.        | live         |
| [03-open-questions.md](03-open-questions.md) | Open and closed questions.                         | live         |
| [05-glossary.md](05-glossary.md)             | Terms with one meaning each.                       | live         |
| [06-architecture.md](06-architecture.md)     | Parts, interfaces, data, limits.                   | live         |
| [07-prior-art.md](07-prior-art.md)           | Each claim of the customer table against the code. | archive      |
| [08-ui.md](08-ui.md)                         | The console, the seven screens, and the two hosts. | live         |
| [09-prompts.md](09-prompts.md)               | The four prompts of the writer and the subagent.   | live         |
| [events.d.ts](events.d.ts)                   | The envelope of an event and the payload of each op. | live         |
| [tree.d.ts](tree.d.ts)                       | The model of the tree, the revision, and the slice. | live         |
| [tools.d.ts](tools.d.ts)                     | The input and the output type of each tool.        | live         |
| [config.d.ts](config.d.ts)                   | The keys of the configuration.                     | live         |
| [../adr/](../adr/)                           | The decisions.                                     | live         |

## Rules

1. Record each statement in [../statements.md](../statements.md) with an identifier.
2. One identifier is one requirement. Each requirement has a source and a status.
3. A requirement must have a test method. If there is no test method, the item is an open
   question, not a requirement.
4. A contradiction becomes an open question with two options. Do not overwrite silently.
5. Record each non-goal. A non-goal must not become a hidden requirement.
6. Record each decision in an ADR.
7. Do not start the code while the requirement is `draft`, unless the customer asks for it.
8. Change the specification with small commits.

## Status values

| Status     | Meaning                                               |
| ---------- | ----------------------------------------------------- |
| `draft`    | Written as understood. Not confirmed.                 |
| `accepted` | Confirmed. The requirement is testable.               |
| `disputed` | Contradicts another statement. See the open question. |
| `deferred` | Postponed on purpose.                                 |
| `superseded` | Replaced by another requirement. The item is in [02-superseded.md](02-superseded.md). |
| `rejected` | Refused on purpose.                                   |
