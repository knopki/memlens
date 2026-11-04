# Goals and non-goals

## Goals

| ID    | Goal | Priority | Source |
| ----- | ---- | -------- | ------ |
| G-001 | TBD  | TBD      | —      |

## Non-goals

Explicitly excluded items. A non-goal must not become a hidden requirement.

| ID     | Non-goal | Reason | Source |
| ------ | -------- | ------ | ------ |
| NG-001 | TBD      | TBD    | —      |

## Constraints

Given from the outside. These items are not open for discussion and they limit the decisions.

| ID    | Constraint                                                                                              | Source |
| ----- | ------------------------------------------------------------------------------------------------------- | ------ |
| C-001 | Work stays inside this repository.                                                                      | S-001  |
| C-002 | Documents and code comments use ASD-STE100 Simplified Technical English.                                | S-003  |
| C-003 | The README has an English, a Russian, and a Chinese version.                                            | S-003  |
| C-004 | The specification is a set of markdown files in this repository.                                        | S-004  |
| C-005 | The stack is TypeScript on Node.js with pnpm workspaces.                                                | S-005  |
| C-006 | The project tools come from `mise.toml`.                                                                | S-007  |
| C-007 | A project check uses a file in this repository only.                                                    | S-009  |
| C-008 | The compiler is TypeScript 7 or newer.                                                                  | S-011  |
| C-009 | New code uses the GRACE-lite markup and log driven development.                                         | S-011  |
| C-010 | The linter is biome, the test runner is vitest, and the bundler is esbuild.                             | S-011  |
| C-011 | No document refers to a `§` section. No identifier refers to an item that the project does not contain. | S-011  |
| C-012 | Client code and backend code stay in separate modules where the split applies.                          | S-011  |
| C-013 | The library does not know the CLI, the plugin, or the user interface.                                   | S-011  |
