# 0031. State order

Status: accepted

## Context

S-021 keeps a proposed record at `proposed` after a `hide`, and it gives the state `deleted` after a `dismiss`. Both answers give the order.

## Decision

The state order is `live`, `hidden`, `proposed`, `deleted`. The ops `hide` and `dismiss` raise the state, and only an `accept` lowers it.

## Alternatives

Put `hidden` above `proposed`. Put `deleted` below `proposed`.

## Consequences

A `hide` event changes no proposed record. A `dismiss` event reaches each record. The `accept` is the one transition that lowers the value.
