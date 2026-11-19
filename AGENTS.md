# memlens

The long-term memory of an agent. One SQLite store holds the notes and a tree of summaries above
them. The agent reads a slice of that tree in its context. The CLI, the DSH plugin, and one browser
console read and write the same store.

This codebase is yours: what it's for and how it's built are your call, and you'll keep building on it.

## Packages

| Package               | Role                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `packages/core`       | The domain, the row store, the slice, and the configuration.                                      |
| `packages/cli`        | The command surface: `note`, `find`, `open`, `compact`, `check`, `repair`, and `ui`.              |
| `packages/dsh-plugin` | The host entry and the preset entry, the shared store, the memory context, the tools, the nudge, and the compaction worker. |
| `packages/ui`         | The browser client of the console.                                                                |

The console holds the profile page, the session tab, the worker status, and the worker journal.

## Documentation

`docs/architecture.md` holds the current state. The files in `docs/features` own the cross-module
behavior, `docs/adr` the decisions, and `docs/glossary.md` the terms. `docs/questions.md` holds an
open question, and the file holds none now.

The code contracts own the implemented rules within one module. Read the module contract and the
entity contract before a change.

The LikeC4 model in `docs/arch` shows the same parts as diagrams. The generated README holds every
view as a Mermaid diagram. Run `pnpm run arch` for the live preview.
Update the model during planning, before you change the architecture.
Run `pnpm run lint:docs` to check it. Run `pnpm run arch:export` to update the diagrams.

The design files belong to the planning stage. Agree their text with the customer before the code
that follows it. Do not write them after the implementation as a record of finished work. A change
edits a file when the plan of the change makes its text wrong. A change adds no scenario, no ADR,
and no glossary row without agreement.

## Decisions

Name a decision before the commit that applies it. Ask the customer before a choice outside the
code: a contract, a schema, a refusal rule, a format, or a public behavior. A choice inside the code
needs no question, and the commit message states it.

## Commits

Follow Conventional Commits: `<type>: <change>`. The types are `feat`, `fix`, `refactor`, `docs`,
and `spec`.

## Implementation

1. Load the `grace-lite` skill before you write or change code. The skill owns the markup, and each
   module contract starts with `@purpose`.
2. Write the module contract before the code of a new source file. Write the contract of each public
   entity before its body.
3. Use log driven development: short debug messages with key-value data. In Node.js, use `debuglog`
   from `node:util`.
4. Write code only from an accepted requirement or a direct customer request. An unknown item
   becomes an open question in `docs/questions.md`.
5. Prefer the smallest implementation that meets the contract.
6. Write tests with each module. Run `pnpm run format`, then `pnpm run verify`, before you finish a
   change.
7. A change of the console needs the build and the tests. The server-rendered tests cover the
   markup, the classes, and the labels. The happy-dom tests cover the clicks, the picks, the keys,
   and the form submit. Open `memlens ui` for a change of a layout.

## Boundaries

- A package declares each workspace package that it imports with the `workspace:*` range. A relative
  import stays inside its package.
- Keep the client code and the backend code in separate files.
- Do not write a `§` reference. Do not name an identifier that the project does not contain.

## Environment

- After a clone, run `mise install`, then `pnpm install`, then `prek install`.
- mise holds the tools that npm does not distribute: node, pnpm, python, and prek. Every other tool
  is a dev dependency. The TypeScript 7 binary is `tsc`.
- `pnpm run verify` runs the build and all checks. The scripts are in the manifest of the root and
  of each package.
- The hooks run biome and the document check before a commit. They run the type check and the tests
  before a push. The document check `pnpm run lint:docs` uses the vendored linter in
  `scripts/vendor/`.
- A tool version has one source: `mise.toml` for the tools, and the manifest for the dev
  dependencies.
- The command `memlens ui` serves the built client in `packages/cli/dist/ui`. Run `pnpm run build`
  before you look at the screen, because the source alone shows no change.

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
