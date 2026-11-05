# 0019. Writer defaults

Status: replaced by 0054

## Context

The measurements give a large cost for a higher effort: 8.8 k output tokens and 120 s for one retelling.

## Decision

The writer defaults follow the measurements. The writer effort is off, one batch holds 6 nodes, and the compactor runs up to 8 jobs in parallel.

## Alternatives

A higher effort by default. One job at a time.

## Consequences

A cheap default. A user can raise the effort when the quality is not sufficient. D-054 gives six calls in a run.
