# Work rules for agents

This repository is in the specification phase. A scaffold of the three packages exists. No part does
work yet. The specification in `docs/spec/` is the only authority for requirements.

## Order of work

1. Write the new statement in [docs/statements.md](docs/statements.md). Use the next identifier
   `S-nnn` and add the date. Do not change the words of the statement.
2. Put the meaning in the correct file:
   - Testable behavior goes to [02-requirements.md](docs/spec/02-requirements.md) as `REQ-nnn`
     with status `draft`.
   - The product boundary goes to [00-overview.md](docs/spec/00-overview.md) or to
     [01-goals-nongoals.md](docs/spec/01-goals-nongoals.md).
   - A choice with consequences goes to [04-decisions.md](docs/spec/04-decisions.md) or to an ADR.
   - A new term goes to [05-glossary.md](docs/spec/05-glossary.md).
   - An unclear point goes to [03-open-questions.md](docs/spec/03-open-questions.md).
3. Compare the statement with the specification. If it contradicts a requirement, set that
   requirement to `disputed` and add an open question with two options. Do not overwrite the
   requirement silently.
4. Make a commit with the message `spec: <change>`.

## Setup

1. Run `mise install` to install the tools from `mise.toml`.
2. Run `pnpm install` to install the packages.
3. Run `prek install` to install the git hooks.

Do not write a tool version in two files. Do not commit `mise.lock`.

## Toolchain

mise holds the tools that npm does not distribute: node, pnpm, python, and prek. Every other tool
is a dev dependency.

| Task                          | Tool                                                    |
| ----------------------------- | ------------------------------------------------------- |
| Type check and declarations   | TypeScript 7, the native compiler. The binary is `tsc`. |
| Lint and format               | biome, a root dev dependency                            |
| Test                          | vitest                                                  |
| Bundle the CLI and the plugin | esbuild                                                 |
| Git hooks                     | prek                                                    |

## Checks

| Command              | Action                                              |
| -------------------- | --------------------------------------------------- |
| `pnpm run typecheck` | Check the types of the three packages.              |
| `pnpm run test`      | Run the tests.                                      |
| `pnpm run lint`      | Check the code and the format with biome.           |
| `pnpm run format`    | Apply the biome changes and the format.             |
| `pnpm run lint:docs` | Check the English documents against the STE limits. |
| `pnpm run verify`    | Run the build and all checks.                       |

The hooks run biome and the document check before a commit. They run the type check and the tests
before a push. `lint:docs` uses the vendored linter in `scripts/vendor/`. See
`scripts/vendor/README.md`. Do not point a check at a file outside this repository.

## Code rules

- Use the GRACE-lite markup in each new source file. Write one `#region moduleContract` block at the
  top, before all code.
- Add a `FUNC_`, `CLASS_`, `METHOD_`, or `COMPONENT_` region for each public or non-trivial entity.
  Leave trivial code unmarked.
- Write the contract fields as JSDoc tags. Each contract needs `@purpose`. `@scope`, `@invariants`,
  `@usecases`, `@dependencies`, `@rationale`, and `@keywords` are optional.
- Do not make up a purpose. If the intent is not clear, ask the customer.
- Use log driven development. Write short debug messages with key-value data. In Node.js, use
  `debuglog` from `node:util`.
- The library imports no CLI, plugin, harness, or user interface package. The test
  `packages/core/tests/isolation.test.ts` enforces this rule.
- Keep client code and backend code in separate modules. Do not mix them in one file.
- Do not write a `§` reference. Do not refer to an identifier that the project does not contain.
- Do not format code by hand. Run `pnpm run format`.

## Prohibitions

- Do not invent requirements. An unknown item is `TBD` or an open question.
- Do not write code before the requirement is `accepted`, or before the customer asks for it.
- Do not work outside this repository without permission.
- Do not edit an old statement. The journal is a record, not a draft.

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
