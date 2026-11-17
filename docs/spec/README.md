# Specification for memlens

## Purpose

This directory defines product boundaries, cross-module requirements, and pending behavior.
Code contracts own implemented rules within one module. Module invariants hold rules that apply throughout that module.
Entity contracts hold rules for a function, a method, or a type beside its implementation.
Read those contracts before a change. The archive retains the original local requirements and links to their code contracts.

## Files

| File                                         | Content                                              | Status  |
| -------------------------------------------- | ---------------------------------------------------- | ------- |
| [00-overview.md](00-overview.md)             | Problem, users, value, success criteria.             | live    |
| [01-goals-nongoals.md](01-goals-nongoals.md) | Goals, non-goals, constraints.                       | live    |
| [02-requirements.md](02-requirements.md)     | Cross-module requirements and pending behavior.      | live    |
| [02-superseded.md](02-superseded.md)         | Replaced, refused, and archived local requirements.  | archive |
| [02-slices.md](02-slices.md)                 | The review order for acceptance, in slices.          | live    |
| [03-open-questions.md](03-open-questions.md) | Open and closed questions.                           | live    |
| [04-data.md](04-data.md)                     | Tables, field groups, versions, and merge channels.  | live    |
| [05-glossary.md](05-glossary.md)             | Terms with one meaning each.                         | live    |
| [06-architecture.md](06-architecture.md)     | Parts, interfaces, data, limits.                     | live    |
| [07-prior-art.md](07-prior-art.md)           | Each claim of the customer table against the code.   | archive |
| [08-ui.md](08-ui.md)                         | The console, the seven screens, and the two hosts.   | live    |
| [09-prompts.md](09-prompts.md)               | The four prompts of the compaction and the subagent. | live    |
| [../adr/](../adr/)                           | The decisions.                                       | live    |

## Rules

1. Give each global requirement one identifier and a status. Local code contracts use no requirement identifier.
2. A requirement must have a test method. If there is no test method, the item is an open
   question, not a requirement.
3. A contradiction becomes an open question with two options. Do not overwrite silently.
4. Record each non-goal. A non-goal must not become a hidden requirement.
5. Record each decision in an ADR.
6. Do not start the code while the requirement is `draft`, unless the customer asks for it.
7. Keep implemented local rules beside the code. Archive their original requirements with links to the owning contracts.
8. Keep cross-module guarantees and pending behavior in the global list.
9. Change the specification with small commits.

## Status values

| Status       | Meaning                                                                               |
| ------------ | ------------------------------------------------------------------------------------- |
| `draft`      | Written as understood. Not confirmed.                                                 |
| `accepted`   | Confirmed. The requirement is testable.                                               |
| `disputed`   | Contradicts another requirement. See the open question.                                |
| `deferred`   | Postponed on purpose.                                                                 |
| `superseded` | Replaced by another requirement. The item is in [02-superseded.md](02-superseded.md). |
| `rejected`   | Refused on purpose. The item is in [02-superseded.md](02-superseded.md).              |
