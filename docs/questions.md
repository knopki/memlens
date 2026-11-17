# Questions

An open question blocks a decision. Each question gives its context and two
options. A closed question leaves this file and its answer becomes a scenario
or an ADR.

### Q-514

Which rule turns a harness session into notes at the pending session import?

The CLI reads sessions of the harness into notes, and it has no reader yet. The
rule that selects the note text is open.

- Option A: The import gives the session text to the model with the compaction
  prompt, and the answer becomes the notes.
- Option B: The import reads the user messages of the session only. Each message
  becomes one note body, and the import calls no model.

### Q-515

Which command gives a copied store file a new identity?

The store identity is one value in `meta`, and it breaks each version tie. A
file copy keeps the identity, so two stores issue versions with one tie-break
part. The CLI has no `store` command. See
[0020](adr/0020-storage-pivot.md) and the
[schema contract](../packages/core/src/store/schema.ts).

- Option A: Add the command `memlens store new-id`. It writes one new identity.
- Option B: A user copies the store and imports it into a new one. No command
  exists.

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

### Q-518

Which prompt does a subagent get?

The design states a subagent prompt, and the preset registers none. No source
file holds the text, so the agent starts without it.

- Option A: Register the prompt in the preset, and write it with the subagent
  mode in the tool contract.
- Option B: Drop the design item. The subagent reads the same tools and needs no
  own prompt.
