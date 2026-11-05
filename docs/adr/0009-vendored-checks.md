# 0009. Vendored checks

Status: accepted

## Context

A check that searched the home directory for a skill failed on another machine and gave an unclear result.

## Decision

The project keeps the check tools in `scripts/vendor/`: the STE linter under MIT and the DSH plugin checker under Apache-2.0 (`dist/` and `templates/` only). A check does not use a file outside the repository.

## Alternatives

Keep the search in the home directory. Copy the entire skill into the repository. Drop the checks.

## Consequences

One setup for each machine. The copies become stale after an upstream release, and `scripts/vendor/README.md` gives the update steps. [D-010](04-decisions.md) replaces the plugin checker part of this decision.
