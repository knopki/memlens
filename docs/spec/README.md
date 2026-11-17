# Specification for memlens

## Purpose

The specification splits into four homes:

| Home            | Owns                                                              |
| --------------- | ----------------------------------------------------------------- |
| `docs/arch`     | The map of the system as a LikeC4 model.                          |
| `docs/features` | Cross-module behavior as Gherkin scenarios.                       |
| `docs/adr`      | The decisions with their context and alternatives.                |
| Code contracts  | Implemented local rules beside the code.                          |

This directory holds the reference pages: the product boundary, the data, the prompts, the user
interface, the glossary, and the open questions.

## Files

| File                                         | Content                                              | Status  |
| -------------------------------------------- | ---------------------------------------------------- | ------- |
| [00-overview.md](00-overview.md)             | Problem, users, value, success criteria.             | live    |
| [01-goals-nongoals.md](01-goals-nongoals.md) | Goals, non-goals, constraints.                       | live    |
| [03-open-questions.md](03-open-questions.md) | Open and closed questions.                           | live    |
| [04-data.md](04-data.md)                     | Tables, field groups, versions, and merge channels.  | live    |
| [05-glossary.md](05-glossary.md)             | Terms with one meaning each.                         | live    |
| [06-architecture.md](06-architecture.md)     | Interfaces, data, limits, and the model pointer.     | live    |
| [07-prior-art.md](07-prior-art.md)           | Each claim of the customer table against the code.   | archive |
| [08-ui.md](08-ui.md)                         | The console, the seven screens, and the two hosts.   | live    |
| [09-prompts.md](09-prompts.md)               | The four prompts of the compaction and the subagent. | live    |
| [archive/](archive/README.md)                | The retired requirement lists.                       | archive |
| [../adr/](../adr/)                           | The decisions.                                       | live    |
| [../features/](../features/README.md)        | The behavior features.                               | live    |
| [../arch/](../arch/README.md)                | The LikeC4 model and its generated views.            | live    |

## Rules

1. A scenario must state one user-visible property. Name its proving test in the file header.
2. A scenario without a proving test carries the tag `@wip` and belongs to open work.
3. A contradiction becomes an open question with two options. Do not overwrite silently.
4. Record each non-goal. A non-goal must not become a hidden requirement.
5. Record each decision in an ADR.
6. Keep implemented local rules beside the code.
7. Change the specification with small commits.
