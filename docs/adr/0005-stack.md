# 0005. Stack

Status: accepted

## Context

The customer selected the stack and the names. A DSH plugin needs TypeScript and Node.js.

## Decision

The stack is TypeScript on Node.js with pnpm workspaces. The packages are `@memlens/core`, `@memlens/cli`, and `@memlens/dsh-plugin`. The binary is `memlens`. The plugin identifier is `dsh-memlens`.

## Alternatives

A Rust core with TypeScript bindings. One package with subpaths.

## Consequences

One toolchain for three parts. The library and the CLI use `tsc`. The plugin uses `tsdown` and the `fixedExtension: false` setting. D-011 replaces the build tools.
