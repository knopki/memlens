# 0034. Catalog scope

Status: accepted

## Context

A tree node must not compress a card of a personal scope with a card of a shared scope.

## Decision

The catalog has one scope for each profile: `__catalog__:<profile>`. A shared scope gets a card in each profile where it is visible.

## Alternatives

One catalog scope for the store. One catalog scope for each session.

## Consequences

The catalog of each profile stays separate. One shared scope gives several cards.
