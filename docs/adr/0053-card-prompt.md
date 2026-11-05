# 0053. Card prompt

Status: accepted

## Context

S-023 gave the join of the bodies. The card must fit one line of the directions block, and a model line is shorter than the bodies.

## Decision

The body of the card is the answer of the model, and the limit is 512 bytes. The direction line adds the `[<key>] ` prefix. The fallback is the three last bodies of the input, joined by `; `, and a cut to 512 bytes. A session end and a compaction build the card of each scope with records of the session.

## Alternatives

The join of the bodies at each build. The model only above the limit. See Q-058.

## Consequences

The card text is not a function of the store alone, and a rebuild is not reproducible. The fallback gives the same text at each build. Each build costs at least one model call. Each build costs at least one model call.
