# Open questions

A blocking question stops the current portion of the specification until the customer answers it.

| ID | Question | Why it matters | Blocks | Owner | Status |
|---|---|---|---|---|---|
| [Q-002](#q-002) | What does the library do? There is no statement about the function yet. | Without the function, no requirement is testable and no architecture is possible. | All requirements | customer | open |
| [Q-004](#q-004) | What does "localization" include: the product interface, the documents, or both? | This decision changes REQ-006 and the file set. | REQ-006 | customer | open |
| [Q-005](#q-005) | Which DSH version does the plugin support? | The plugin API changes between DSH releases. | REQ-003 | customer | open |
| [Q-006](#q-006) | Does the plugin use the library? | If yes, the library has one public interface for two frontends. If no, the plugin repeats the work. | [06-architecture.md](06-architecture.md) | customer | open |
| [Q-007](#q-007) | Which license does the project use? | npm publication and the plugin manifest need a license value. | Publishing | customer | open |
| [Q-008](#q-008) | Does the plugin package need a README in five languages? The DSH guide recommends English, Chinese, Spanish, Portuguese, and Hindi for a published plugin. The project uses English, Russian, and Chinese. | The check item `readme-five-langs` stays unsatisfied without the five files. | Publishing | customer | open |

## Details

### Q-002

No statement yet. A guess here would become a false requirement.

### Q-005

The installed host is DeepSeek Harness 0.2.1-rc.5. The scaffold uses this version. A published plugin
needs a clear support range.

### Q-006

Assumption in this specification: the plugin uses the same library functions as the CLI. This
assumption is not a requirement. It stays an assumption until the customer agrees to it.

### Q-007

No license value in the manifests. The file set has no `LICENSE`.

### Q-008

The project rule is three languages. See [D-006](04-decisions.md). The DSH guide recommends five for
a published plugin.

## Closed questions

| ID | Question | Answer | Date |
|---|---|---|---|
| Q-001 | Which stack and language does the project use? | TypeScript on Node.js with pnpm workspaces. See [D-005](04-decisions.md). | 2026-11-04 |
| Q-003 | What are the package names, the binary name, and the plugin identifier? | `@memlens/core`, `@memlens/cli`, `@memlens/dsh-plugin`, binary `memlens`, plugin identifier `dsh-memlens`. See [D-005](04-decisions.md). | 2026-11-04 |
