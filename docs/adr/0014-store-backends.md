# 0014. Store backends

Status: accepted

## Context

The customer gave both backends the same rank and gave the XDG paths.

## Decision

The store has two backends of equal rank: sqlite and jsonl. The configuration lives in `$XDG_CONFIG_HOME/memlens` and the data in `$XDG_DATA_HOME/memlens`. `MEMLENS_STORE` gives another data path.

## Alternatives

One backend only. A database server.

## Consequences

One store test for two backends. The JSONL backend needs the sidecar index. See [REQ-042](02-requirements.md).
