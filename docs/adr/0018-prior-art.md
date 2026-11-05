# 0018. Prior art

Status: accepted

## Context

The customer examined seven implementations and selected the parts. Each refused part has a product reason.

## Decision

The project takes these parts of the prior art. The first part: the frontier geometry and the addresses `#id` and `#a-b`. The second part: the most overdue pair rule, the retry by the length ruler, and the shrink check. The third part: the background compactor, the scope model, and the port form. The fourth part: the freeze for a session, the idempotency by `sourceId`, and `supersedes`. The project does not take a blocking wake or maintenance in the agent loop. It does not take a regular expression search, a message as a leaf, or an unbounded view.

## Alternatives

Adopt one implementation as a whole. Invent the design without the prior art.

## Consequences

The project keeps the invariants and refuses the product decisions that cost a turn or an unbounded view. The export and the import move the records between machines. The address uses `pos`, not `#id` (D-062). The key is `idem`, not `sourceId` (D-026).
