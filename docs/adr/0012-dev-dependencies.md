# 0012. Dev dependencies

Status: accepted

## Context

biome was a mise tool. The pre-commit hook then started a mise install and needed the network. The lockfile gives one pinned version for each package.

## Decision

A tool that the packages run comes from npm as a dev dependency, so the lockfile pins it. mise holds the machine toolchain: node, pnpm, python, and prek.

## Alternatives

Keep biome in mise. Put every tool in mise. Put every tool in npm.

## Consequences

The hook runs offline from `node_modules`. The lockfile pins each npm tool. mise holds the tools that npm does not distribute.
