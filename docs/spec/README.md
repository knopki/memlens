# Specification for memlens

## Purpose

This directory is the only authority for requirements. It tells what memlens does, for whom, and
what memlens does not do. Statements come in portions. Each statement becomes a testable
requirement.

## Files

| File                                         | Content                                       | Status       |
| -------------------------------------------- | --------------------------------------------- | ------------ |
| [00-overview.md](00-overview.md)             | Problem, users, value, success criteria.      | draft        |
| [01-goals-nongoals.md](01-goals-nongoals.md) | Goals, non-goals, constraints.                | draft        |
| [02-requirements.md](02-requirements.md)     | Requirements with identifiers and status.     | draft        |
| [03-open-questions.md](03-open-questions.md) | Open and closed questions.                    | live         |
| [04-decisions.md](04-decisions.md)           | Decisions with alternatives and consequences. | live         |
| [05-glossary.md](05-glossary.md)             | Terms with one meaning each.                  | live         |
| [06-architecture.md](06-architecture.md)     | Parts, interfaces, data, limits.              | not started  |
| [../adr/](../adr/)                           | Long decisions, one file for each.            | as necessary |

## Rules

1. Record each statement in [../statements.md](../statements.md) with an identifier.
2. One identifier is one requirement. Each requirement has a source and a status.
3. A requirement must have a test method. If there is no test method, the item is an open
   question, not a requirement.
4. A contradiction becomes an open question with two options. Do not overwrite silently.
5. Record each non-goal. A non-goal must not become a hidden requirement.
6. Record each choice with consequences in [04-decisions.md](04-decisions.md) or in an ADR.
7. Do not start the code while the requirement is `draft`, unless the customer asks for it.
8. Change the specification with small commits.

## Status values

| Status     | Meaning                                               |
| ---------- | ----------------------------------------------------- |
| `draft`    | Written as understood. Not confirmed.                 |
| `accepted` | Confirmed. The requirement is testable.               |
| `disputed` | Contradicts another statement. See the open question. |
| `deferred` | Postponed on purpose.                                 |
| `rejected` | Refused on purpose.                                   |
