# 0049. Store version

Status: accepted

## Context

A view cache must see each change of the content, and two stores must not agree by accident.

## Decision

`storeRev` is a counter that grows in the transaction of each edit in SQLite, and a fingerprint of the file in JSONL. The count of the events and the `pos` are not a version.

## Alternatives

The count of the events. The highest `pos`.

## Consequences

An edit that keeps the count of the events still changes the version. The JSONL backend reads the file.
