# Work rules for agents

The core library implements the domain, one SQLite row store, the slice, and the configuration. The
CLI implements the command surface, including `compact`, `check`, `repair`, and `ui`. The session
import is pending. The plugin implements host and preset configuration, one shared store, the memory
context, the six tools, the nudge, and the background compaction worker. The console surfaces are
the profile page, the session tab, the worker status, and the worker journal.
See [docs/architecture.md](docs/architecture.md) for the current state.
The behavior features in `docs/features/` own cross-module behavior. The file
[docs/questions.md](docs/questions.md) owns the open questions.
Code contracts own implemented rules within one module. Read the module contract and the relevant
entity contract before a change.

The LikeC4 model in [docs/arch](docs/arch/README.md) shows the same parts as diagrams. The
generated README holds every view as a Mermaid diagram. Run `pnpm run arch` for the live preview.
The model check runs inside `pnpm run lint:docs`. Update the model with each architecture change.

## Documentation

The files [docs/features](docs/features/README.md), `docs/adr`, [docs/architecture.md](docs/architecture.md),
and [docs/glossary.md](docs/glossary.md) state the design. They belong to the planning stage. Agree
their text with the customer before the code that follows it. Do not write them after the
implementation as a record of finished work. A change edits a file when the plan of the change makes
its text wrong. A change adds no scenario, no ADR, and no glossary row without agreement.

Keep requirement identifiers out of code contracts.

## Decisions

Name a decision before the commit that applies it. Ask the customer before a choice outside the code:
a contract, a schema, a refusal rule, a format, or a public behavior. A choice inside the code needs no
question, and the commit message states it.

Commit with the message `<type>: <change>`. The types are `feat`, `fix`, `refactor`, `docs`, and `spec`.

## Implementation

1. Write the module contract before the code of a new source file. Write the contract of each
   public entity before its body.
2. Use the GRACE-lite markup: one `#region moduleContract` block at the top, before all code. Add
   a `FUNC_`, `CLASS_`, `METHOD_`, or `COMPONENT_` region for each public or non-trivial entity.
   Leave trivial code unmarked.
3. Write the contract fields as JSDoc tags. Each contract needs `@purpose`. The fields `@scope`,
   `@invariants`, `@usecases`, `@dependencies`, `@rationale`, and `@keywords` are optional.
4. Do not make up a purpose. If the intent is not clear, ask the customer.
5. Use log driven development. Write short debug messages with key-value data. In Node.js, use
   `debuglog` from `node:util`.
6. Write code only from an accepted requirement or a direct customer request. An unknown item is
   `TBD` or an open question.
7. Prefer the smallest implementation that meets the contract.
8. Write tests with each module. Run `pnpm run verify` before you finish a change. Run
   `pnpm run format` for the format.
9. A change of the console needs the build and the page. Run `pnpm run verify`, then open
   `memlens ui` and look at the screen. The console host serves the built `packages/cli/dist/ui`,
   so the source alone shows no change.

## Boundaries

- The library imports no CLI, plugin, harness, or user interface package. The test
  `packages/core/tests/isolation.test.ts` enforces this rule.
- A package declares each workspace package that it imports with the `workspace:*` range. A relative
  import stays inside its package.
- The library serves a browser client through the subpath `@memlens/core/view`. The root imports
  Node.js modules, so a browser bundle must not take the root.
- Keep client code and backend code in separate modules. Do not mix them in one file.
- Do not write a `§` reference. Do not refer to an identifier that the project does not contain.
- Do not point a check at a file outside this repository.

## Environment

- After a clone, run `mise install`, then `pnpm install`, then `prek install`.
- mise holds the tools that npm does not distribute: node, pnpm, python, and prek. Every other tool
  is a dev dependency. The TypeScript 7 binary is `tsc`.
- `pnpm run verify` runs the build and all checks. The scripts are in the manifest of the root and
  of each package.
- The hooks run biome and the document check before a commit. They run the type check and the tests
  before a push. The document check `pnpm run lint:docs` uses the vendored linter in
  `scripts/vendor/`.
- A rebuild of the plugin client does not refresh the GUI alone. The harness serves all plugin
  clients as one revision-keyed bundle, and a service worker holds the `/plugins/` scope. Restart
  the harness host, then reload the page. Unregister the service worker when the page still shows
  old code.
- Do not write a tool version in two files. Do not commit `mise.lock`.

## Language rules

Use ASD-STE100 Simplified Technical English in all documents and in all code comments.

| Item                         | Limit               |
| ---------------------------- | ------------------- |
| Sentence length, instruction | 20 words maximum    |
| Sentence length, description | 25 words maximum    |
| Paragraph length             | 6 sentences maximum |
| Words in a noun group        | 3 maximum           |

- Use the imperative form for instructions. Write: "Run the test."
- Use the active voice.
- Use the simple present, simple past, and simple future tenses only.
- Use the past participle only as an adjective.
- Use the "-ing" form only as a technical noun.
- Use "must" for an obligation. Do not use "should" or "may".
- Do not use Latin abbreviations. Write "for example", not "e.g.".
- Use one word for one meaning. Use the terms from the glossary.
- Agree a new term with the customer before you use it in a document.
- Keep the README in the eight languages of the DSH set: `de`, `en`, `es`, `fr`, `ja`, `pt`, `ru`, and `zh`.
