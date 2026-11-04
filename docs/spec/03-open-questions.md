# Open questions

A blocking question stops the current portion of the specification until the customer answers it.

| ID | Question | Why it matters | Blocks | Owner | Status |
|---|---|---|---|---|---|
| [Q-001](#q-001) | Which stack and language does the project use? Options: TypeScript with Node.js and pnpm workspaces. Other options are possible. | The stack gives the package manifests, the build, and the test tools. | Scaffolding, [06-architecture.md](06-architecture.md) | customer | open |
| [Q-002](#q-002) | What does the library do? There is no statement about the function yet. | Without the function, no requirement is testable and no architecture is possible. | All requirements | customer | open |
| [Q-003](#q-003) | What are the package names, the binary name, and the plugin identifier? | Names appear in the manifests, the CLI help, and the DSH configuration. | Scaffolding | customer | open |
| [Q-004](#q-004) | What does "localization" include: the product interface, the documents, or both? | This decision changes REQ-006 and the file set. | REQ-006 | customer | open |
| [Q-005](#q-005) | Which DSH version does the plugin support? | The plugin API changes between DSH releases. | REQ-003 | customer | open |
| [Q-006](#q-006) | Do the CLI frontend and the DSH plugin use the same library functions? | If yes, the library has one public interface. If no, the library has two. | [06-architecture.md](06-architecture.md) | customer | open |

## Details

### Q-001

The project has a DSH plugin. A DSH plugin uses TypeScript and Node.js. Therefore TypeScript with
Node.js and pnpm workspaces is the recommended option. A different stack needs a reason.

### Q-002

No statement yet. A guess here would become a false requirement.

### Q-006

Assumption in this specification: the CLI frontend and the DSH plugin use the same library
functions. This assumption is not a requirement. It stays an assumption until the customer
confirms or corrects it.

## Closed questions

| ID | Question | Answer | Date |
|---|---|---|---|
| — | — | — | — |
