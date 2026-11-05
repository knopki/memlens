# 0016. Event union

Status: accepted

## Context

Two stores must merge without a coordinator. A union needs no clock order.

## Decision

A merge is a union of events by id. The projection converges for any order of arrival.

## Alternatives

Last write wins. A vector clock. A central server.

## Consequences

The merge is simple and repeatable. A conflict rule for one id stays open.
