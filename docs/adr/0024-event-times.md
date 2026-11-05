# 0024. Event times

Status: accepted

## Context

A note can enter the log after the time of the write. The log needs its own order.

## Decision

An event has two times. `at` is the time of the log, and `ts` is the time of the write of a note.

## Alternatives

One time for the both fields.

## Consequences

The log order comes from `at`. A note keeps the time of its write after an import.
