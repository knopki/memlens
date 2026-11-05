# 0011. Build tools

Status: accepted

## Context

The customer selected the toolchain. The native compiler type checks and writes declarations, so one tool covers the core. A bundle is necessary for the CLI binary and for the plugin entry.

## Decision

The project builds with TypeScript 7, the native compiler. The preview name of the compiler was `tsgo`, and the binary is `tsc`. The core builds with `tsc` and writes JavaScript and declarations. The CLI and the plugin build with esbuild as one bundle. The plugin gets its declarations from `tsc --emitDeclarationOnly`. biome lints and formats. vitest runs the tests. prek runs the git hooks.

## Alternatives

tsc 5 with tsdown. eslint with prettier. husky with lint-staged.

## Consequences

One compiler for the types. esbuild writes no declarations, so the plugin runs `tsc` for them. The plugin bundle keeps the packages external.
