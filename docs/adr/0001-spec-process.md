# 0001. Spec process

Status: accepted

## Context

The specification lives in `docs/spec/`, and the statement journal keeps the customer words. The documents use ASD-STE100. The specification stays draft until the customer accepts an item. The checks use files in this repository.

## Decisions

| ID | Date | Decision | Context | Alternatives | Consequences |
| --- | --- | --- | --- | --- | --- |
| D-001 | 2026-11-04 | The specification is a set of markdown files in `docs/spec/` with a statement journal in `docs/statements.md`. | Statements come in portions. The project needs a trace from the customer words to a requirement, and a review by diff. | One `SPEC.md` file. An external tracker. | Small diffs in git. The project needs discipline with identifiers. No external tracker. |
| D-002 | 2026-11-04 | Each statement goes to the journal first, word for word. The meaning goes to the specification. | The meaning can drift. The original words give a second source for a conflict check. | Write the requirement directly, without the journal. | The same item appears two times: in the journal and in the requirement. The journal stays small and unchanged. |
| D-003 | 2026-11-04 | All documents and code comments use ASD-STE100 Simplified Technical English. The README also has the eight languages of the DSH set. | The customer selected STE for the entire project. STE gives short sentences and one meaning for each word. | Russian documents. Plain English. | Clear text for readers with a different first language. The writing needs a check against the STE limits. |
| D-004 | 2026-11-04 | The specification stays `draft` until the customer accepts an item. Code does not start before that, unless the customer asks for it. | A wrong requirement becomes expensive code. | Write code from a draft requirement. | The project waits for an agreement. The specification is correct before the code. |
| D-009 | 2026-11-04 | The project keeps the check tools in `scripts/vendor/`: the STE linter under MIT and the DSH plugin checker under Apache-2.0 (`dist/` and `templates/` only). A check does not use a file outside the repository. | A check that searched the home directory for a skill failed on another machine and gave an unclear result. | Keep the search in the home directory. Copy the entire skill into the repository. Drop the checks. | One setup for each machine. The copies become stale after an upstream release, and `scripts/vendor/README.md` gives the update steps. [D-010](04-decisions.md) replaces the plugin checker part of this decision. |
| D-010 | 2026-11-04 | The plugin manifest gets a test in `packages/dsh-plugin/tests/manifest.test.ts`, not a vendored checker. The test covers the bundle row, the patch path, and the entry file. It also covers the exports, the file list, the locale metadata, the icon size, and the harness dependency rules. | The checker from `dsh-plugin-guide` was a frozen third-party bundle, and its rules disagreed with the project decisions. The manifest invariants are small and ours. | Keep the vendored checker. Depend on `dsh-plugin-guide` from npm. No check. | The repository has no third-party bundle. A real install with `dsh plugin add` stays the release gate. The test needs the `yaml` dev dependency. |
