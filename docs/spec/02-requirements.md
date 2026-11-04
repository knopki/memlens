# Requirements

Type: `FR` is a function, `NFR` is a quality limit, `C` is an external constraint on the product.

Status: see [README.md](README.md#status-values).

| ID | Requirement | Type | Status | Source | Test method |
|---|---|---|---|---|---|
| REQ-001 | memlens includes a headless library. | FR | draft | S-002 | The repository has the library package. The package builds. The package has no user interface. |
| REQ-002 | memlens includes a CLI frontend. | FR | draft | S-002 | A command in a terminal starts the library function. |
| REQ-003 | memlens includes a DSH plugin. | FR | draft | S-002 | The plugin installs in DeepSeek Harness. The plugin starts. |
| REQ-004 | All documents and code comments use ASD-STE100 Simplified Technical English. | C | draft | S-003 | Each sentence obeys the limits in [../../AGENTS.md](../../AGENTS.md#language-rules). |
| REQ-005 | The README has an English version, a Russian version, and a Chinese version. | FR | draft | S-003 | The repository has `README.md`, `README.ru.md`, and `README.zh.md` with the same content. |
| REQ-006 | The product has localization for Russian and Chinese. | FR | draft | S-003 | TBD. The scope of "localization" is open. See [Q-004](03-open-questions.md#q-004). |

## Rules for new requirements

- One requirement is one sentence. Do not put two different properties in one sentence.
- Write the behavior that the user can see. Do not write the mechanism, unless the customer
  gives the mechanism as a constraint.
- Write the test method before you set the status to `accepted`.
