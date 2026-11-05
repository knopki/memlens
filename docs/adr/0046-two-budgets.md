# 0046. Two budgets

Status: accepted

## Context

Two parts of the slice need one limit each, and a total hides which part spends the bytes.

## Decision

The configuration sets no total budget. The budget `here` limits the tree of the active scope, and the budget `directions` limits the tree of the catalog.

## Alternatives

One total budget for the slice. Three budgets with `slice`.

## Consequences

A user sets the detail of the current project and the size of the map apart. No cap covers both.
