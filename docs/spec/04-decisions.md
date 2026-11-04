# Decision log

A small decision stays here. A decision that is expensive to change, or that needs an explanation
after six months, gets a separate ADR in [../adr/](../adr/).

| ID | Date | Decision | Context | Alternatives | Consequences |
|---|---|---|---|---|---|
| D-001 | 2026-11-04 | The specification is a set of markdown files in `docs/spec/` with a statement journal in `docs/statements.md`. | Statements come in portions. The project needs a trace from the customer words to a requirement, and a review by diff. | One `SPEC.md` file. An external tracker. | Small diffs in git. The project needs discipline with identifiers. No external tracker. |
| D-002 | 2026-11-04 | Each statement goes to the journal first, word for word. The meaning goes to the specification. | The meaning can drift. The original words give a second source for a conflict check. | Write the requirement directly, without the journal. | The same item appears two times: in the journal and in the requirement. The journal stays small and unchanged. |
| D-003 | 2026-11-04 | All documents and code comments use ASD-STE100 Simplified Technical English. The README also has a Russian and a Chinese version. | The customer selected STE for the entire project. STE gives short sentences and one meaning for each word. | Russian documents. Plain English. | Clear text for readers with a different first language. The writing needs a check against the STE limits. |
| D-004 | 2026-11-04 | The specification stays `draft` until the customer confirms an item. Code does not start before that, unless the customer asks for it. | A wrong requirement becomes expensive code. | Write code from a draft requirement. | The project waits for a confirmation. The specification is correct before the code. |
