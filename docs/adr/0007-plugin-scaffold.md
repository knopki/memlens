# 0007. Plugin scaffold

Status: accepted

## Context

The template is the verified starting point for a DSH plugin.

## Decision

The scaffold uses the DSH plugin contract from the `dsh-plugin-guide` template. The contract has manifest version 1, a bundle patch file, display metadata, and peer dependencies on the harness packages.

## Alternatives

A hand-written manifest.

## Consequences

The plugin manifest passes `plugin-check`. A future host version can break the peer range. See [Q-005](03-open-questions.md#q-005).
