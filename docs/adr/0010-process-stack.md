# 0010. Process and stack

Status: accepted

## Context

The specification is a set of markdown files. The tools come
from mise and from npm.

## Decision

The specification lives in `docs/spec/`. The documents use ASD-STE100. The
specification stays draft until the customer accepts an item. The stack is TypeScript 7 on Node.js
with pnpm workspaces. The packages are core, cli, and plugin. Tool versions come from `mise.toml`,
and the tools that the packages run are dev dependencies.

## Alternatives

One `SPEC.md` file. An external tracker. A Rust core. Exact pins with a lockfile.

## Consequences

The checks use files in this repository. The manifest has a test. The README takes the eight
languages of the DSH set.
