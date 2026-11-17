# 0024. LikeC4 model

Status: accepted.

## Context

The specification holds 12 files with 115 live requirements. The architecture
document states the parts in 497 lines of prose. The customer wants broad
strokes at the top and detail only in places. ADRs already record the
decisions. Module contracts already hold the implemented local rules. The
customer approved a pilot on 2026-11-17: build the model first, and evaluate
the behavior format after it.

## Decision

Describe the system in a LikeC4 model in [docs/arch](../arch/README.md). The
model owns the map: the context, the containers, the parts of the core and the
plugin, the main use cases, and the deployment. The model names no file and no
requirement identifier. ADRs stay the decision log. Module contracts stay the
local rules. The command `likec4 validate docs/arch` runs inside `pnpm run lint:docs`.

The customer accepted the format on 2026-11-17 and ordered the split. The
requirement lists left the repository: the behavior rows became scenarios in
[docs/features](../features/README.md), and the structure rows moved to the
manifests and the model. The architecture prose now lives in
[docs/architecture.md](../architecture.md).

## Alternatives

Keep the prose only: the parts stay hidden in 497 lines, and no view gives one
look.
Use Structurizr DSL: the tool needs a JVM, and the repository holds none.
Use Mermaid: the diagrams carry no semantic model, and no step validates the
references.
Use Draw.io: the files are not text, and the diffs are unreadable.

## Consequences

The repository carries one dev dependency more. Each architecture change must
update the model, or `pnpm run lint:docs` still passes with a stale map: the
command validates references, not truth. The architecture prose no longer
repeats the map, so a structural change updates the model alone. A behavior
change updates the scenario and its proving test.
