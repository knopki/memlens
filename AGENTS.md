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

Do not write a tool version in another file. Change `mise.toml` instead. Do not commit `mise.lock`.

## Checks

Run these commands before you commit:

| Command | Action |
|---|---|
| `pnpm run typecheck` | Check the types of the three packages. |
| `pnpm run test` | Run the tests. |
| `pnpm run lint:docs` | Check the English documents against the STE limits. |

`lint:docs` uses the vendored linter in `scripts/vendor/`. See `scripts/vendor/README.md`. Do not point
a check at a file outside this repository. The test of `packages/dsh-plugin` checks the plugin
manifest. Run `pnpm run test` for that check.

## Prohibitions

- Do not invent requirements. An unknown item is `TBD` or an open question.
- Do not write code before the requirement is `accepted`, or before the customer asks for it.
- Do not work outside this repository without permission.
- Do not edit an old statement. The journal is a record, not a draft.

## Language rules

Use ASD-STE100 Simplified Technical English in all documents and in all code comments.

| Item | Limit |
|---|---|
| Sentence length, instruction | 20 words maximum |
| Sentence length, description | 25 words maximum |
| Paragraph length | 6 sentences maximum |
| Words in a noun group | 3 maximum |

- Use the imperative form for instructions. Write: "Run the test."
- Use the active voice.
- Use the simple present, simple past, and simple future tenses only.
- Use the past participle only as an adjective.
- Use the "-ing" form only as a technical noun.
- Use "must" for an obligation. Do not use "should" or "may".
- Do not use Latin abbreviations. Write "for example", not "e.g.".
- Use one word for one meaning. Use the terms from the glossary.
- Add a new term to the glossary before you use it in a document.
- Keep the README in three languages: English, Russian, and Chinese.
- Quotes in the statement journal stay in the source language.
