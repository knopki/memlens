# Glossary

One term has one meaning in all documents and in all code. This file is also the terminology base
for ASD-STE100 rule 1.8: a technical noun that is in this table is approved for the project.

| Term | Meaning | Source |
|---|---|---|
| memlens | The project in this repository: a headless library, a CLI frontend, and a DSH plugin. | S-002 |
| statement | A customer sentence in the chat, recorded word for word with an identifier `S-nnn`. | D-002 |
| requirement | A testable sentence about the behavior of the system, with an identifier `REQ-nnn`. | [README.md](README.md) |
| constraint | A limit that comes from the customer or from the environment, with an identifier `C-nnn`. | [01-goals-nongoals.md](01-goals-nongoals.md) |
| non-goal | An item that the project does not do, with an identifier `NG-nnn`. | [01-goals-nongoals.md](01-goals-nongoals.md) |
| open question | An item without an answer, with an identifier `Q-nnn`. | [03-open-questions.md](03-open-questions.md) |
| decision | A selected option with a record of the alternatives, with an identifier `D-nnn`. | [04-decisions.md](04-decisions.md) |
| journal | The file [../statements.md](../statements.md). It keeps the customer words. | D-002 |
| headless | Without a user interface. Other programs start the function. | S-002 |
| library | The package with the main function. It has no terminal interface and no plugin interface. | REQ-001 |
| frontend | The part that gives access to the library for a user or for a program. The project has a CLI frontend and a plugin frontend. | S-002 |
| CLI | Command line interface. The user starts the function from a terminal. | S-002 |
| DSH | DeepSeek Harness, the agent harness that starts the plugin. | S-002 |
| plugin | The package that DSH loads. The plugin gives access to the library from DSH. | REQ-003 |
| localization | The translation of the product text for one language. The scope of the term is open. | Q-004 |
| STE | ASD-STE100 Simplified Technical English, the writing standard of this project. | S-003 |
| TBD | To be determined. The item has no value yet. The item is not a requirement. | — |
