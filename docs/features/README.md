# Behavior features

Each file states one capability across modules in Gherkin. A scenario holds
one user-visible property. The header of each file cites the proving tests and
the decisions.

## Rules

1. One feature file covers one capability across modules.
2. One scenario holds one user-visible property. Do not merge two guarantees.
3. State the behavior, not the mechanism. An exception applies when the
   customer gives the mechanism as a constraint.
4. A scenario is a flow: a state, an action of an actor, and an observable
   outcome. A load rule, a value check, and an absence of a check belong in
   the invariants of the owning contract, not here.
5. The file header holds two comments: the proving test paths and the ADR
   numbers.
6. Tag a scenario `@wip` when no test proves it. Name the missing proof in a
   comment above it. Tag a contradicted scenario `@disputed` and open a
   question with two options.
7. Write ASD-STE100 English. Keep each step line short.
8. Module invariants stay in the code contracts beside their implementation.
   The glossary holds the terms.

## Files

| File                   | Capability                        | Scenarios |
| ---------------------- | --------------------------------- | --------- |
| addresses.feature     | Address forms and active scope    | 4         |
| agent-tools.feature   | The six memory tools              | 13        |
| compaction.feature    | Batch compaction                  | 8         |
| config.feature        | Configuration and active scope    | 5         |
| console.feature       | Console surfaces in the harness   | 9         |
| memory-context.feature | The memory snapshot              | 8         |
| nudge.feature         | The nudge counters                | 5         |
| proposals.feature     | Subagent modes and proposals      | 17        |
| schema.feature        | The store schema and its version  | 2         |
| session-import.feature | Session import (pending)          | 1         |
| store.feature         | The row store and the tree        | 10        |
| transfer.feature      | JSONL transfer and store merge    | 6         |
