# Architecture model

This folder holds the LikeC4 model of memlens. The model shows the system in
broad strokes. It holds the context, the containers, the parts of the core and
the plugin, three use cases, and one deployment. Status: pilot. See
[ADR-0024](../adr/0024-likec4-model.md).

## Preview

Run `pnpm exec likec4 start docs/arch`. The command serves a local preview on
port 5173. Each save of a source file updates the browser immediately.

## Check

The step `pnpm run lint:docs` runs `likec4 validate docs/arch`. The check
reports syntax errors and broken references.

## Sources

| File               | Content                   |
| ------------------ | ------------------------- |
| `src/_spec.c4`     | The kinds and the tags.   |
| `src/model.c4`     | Elements and relations.   |
| `src/views.c4`     | The static views.         |
| `src/use-cases.c4` | The dynamic views.        |
| `src/deployment.c4` | The deployment and its view. |

## Detail

The model holds no local rules. Read the module contracts in the code for
implemented behavior. The prose specification stays in
[docs/spec](../spec/README.md) until the customer accepts this format.
