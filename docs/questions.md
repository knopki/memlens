# Questions

An open question blocks a decision. Each question gives its context and two
options. A closed question leaves this file and its answer becomes a scenario
or an ADR.

### Q-516

Which rule applies a change of the `language` key to the index tokenizer?

The tokenizer is a value in `meta`. The index holds the tokenizer of its build.
A change of the key rebuilds nothing, and a plain open keeps the stored value.
See the [schema contract](../packages/core/src/store/schema.ts) and the
[search contract](../packages/core/src/store/search.ts).

- Option A: One explicit command drops and rebuilds the index in one
  transaction. A plain open with a mismatch logs a warning and keeps the stored
  tokenizer.
- Option B: `memlens repair` rebuilds the index, and the config change sets the
  key only.

### Q-517

Does the export take a version filter for a later import?

The export writes the whole store or one scope. The design named an incremental
export as a filter on the same rows, and the command has no such filter. See the
[transfer contract](../packages/core/src/store/transfer.ts).

- Option A: Add a filter by version. It writes the notes above one version.
- Option B: Keep the whole-store export. The import is idempotent, and no filter
  is necessary.
