# Work rules for agents

The core library implements the domain, both persistent backends, the writer, the slice, and
the configuration. The CLI implements the command surface, including `compact`, `check`, `repair`,
and `ui`. The session import is pending. The plugin has a scaffold, and the console tab of the
plugin is pending.
See [06-architecture.md](docs/spec/06-architecture.md) for the current state.
The specification in `docs/spec/` owns cross-module requirements and pending behavior.
Code contracts own implemented rules within one module. Read the module contract and the relevant
entity contract before a change.

## New customer input

1. Record a fresh customer message about the product in [docs/statements.md](docs/statements.md).
   Use the next identifier `S-nnn` and add the date. Do not change the words.
2. Never record a repeated instruction, a process reply, or a journal correction. These are not
   statements.
3. Put the meaning in the correct file:
   - Cross-module behavior and pending behavior go to [02-requirements.md](docs/spec/02-requirements.md) with status `draft`.
   - Implemented local behavior goes to module invariants or an entity contract beside its implementation.
   - Keep requirement identifiers out of code contracts. Archive original requirements in [02-superseded.md](docs/spec/02-superseded.md).
   - The product boundary goes to [00-overview.md](docs/spec/00-overview.md) or to
     [01-goals-nongoals.md](docs/spec/01-goals-nongoals.md).
   - A choice with consequences goes to an ADR.
   - A new term goes to [05-glossary.md](docs/spec/05-glossary.md) before its first use.
   - An unclear point goes to [03-open-questions.md](docs/spec/03-open-questions.md).
4. Compare the statement with the specification. If it contradicts a requirement, set that
   requirement to `disputed` and add an open question with two options. Do not overwrite the
   requirement silently.
5. Commit with the message `spec: <change>`. Never edit an old statement. Never reuse the
   identifier of a deleted entry.

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

## Boundaries

- The library imports no CLI, plugin, harness, or user interface package. The test
  `packages/core/tests/isolation.test.ts` enforces this rule.
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
- Add a new term to the glossary before you use it in a document.
- Keep the README in the eight languages of the DSH set: `de`, `en`, `es`, `fr`, `ja`, `pt`, `ru`, and `zh`.
- Quotes in the statement journal stay in the source language.
