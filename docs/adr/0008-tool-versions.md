# 0008. Tool versions

Status: accepted

## Context

The customer installs the project tools with mise. A patch pin without a lockfile gives false precision and manual work at each release.

## Decision

Tool versions come from `mise.toml` as release lines: node 24, pnpm 12, and python 3.14. `mise install` gives a version inside each line, and `mise upgrade` takes the newest patch. The project does not commit `mise.lock`.

## Alternatives

An exact pin of each patch with a committed lockfile. No pins and system tools.

## Consequences

One setup command for each clone. Security patches arrive with `mise upgrade`. A new patch can change behavior, and the checks catch it. The pnpm line must agree with `packageManager` in package.json.
