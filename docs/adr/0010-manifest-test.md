# 0010. Manifest test

Status: accepted

## Context

The checker from `dsh-plugin-guide` was a frozen third-party bundle, and its rules disagreed with the project decisions. The manifest invariants are small and ours.

## Decision

The plugin manifest gets a test in `packages/dsh-plugin/tests/manifest.test.ts`, not a vendored checker. The test covers the bundle row, the patch path, and the entry file. It also covers the exports, the file list, the locale metadata, the icon size, and the harness dependency rules.

## Alternatives

Keep the vendored checker. Depend on `dsh-plugin-guide` from npm. No check.

## Consequences

The repository has no third-party bundle. A real install with `dsh plugin add` stays the release gate. The test needs the `yaml` dev dependency.
