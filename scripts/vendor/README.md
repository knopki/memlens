# Vendored tools

The project keeps its check tools in this directory. A check uses a file in this repository only.

## ste-lint.py

| Item | Value |
|---|---|
| Source | The `asd-ste100` skill, https://github.com/danyuchn/asd-ste100-skill |
| License | MIT. See [LICENSE](LICENSE). |
| Taken | 2026-11-04 |
| SHA-256 | `b529ac026958ca2fee2316378f4b0e52a8170ba0dedc1ea95aa318822cf1cbab` |
| Change | None. The file is the same as the source file. |

## dsh-plugin-guide

The DeepSeek Harness plugin checker. The copy has `dist/` and `templates/`. The other directories of
the source package are not necessary for the check.

| Item | Value |
|---|---|
| Source | The `dsh-plugin-guide` package, version 0.3.39 |
| License | Apache-2.0. See [LICENSE](dsh-plugin-guide/LICENSE) and [NOTICE.md](dsh-plugin-guide/NOTICE.md). |
| Taken | 2026-11-04 |
| SHA-256 | `03610f4b88d4baec264113ac4336632482afa25f5eb27af7ab6b08730c91924e` |
| Change | None. The files are the same as the source files. |

The checker follows the DSH version of its release. A newer DSH host can make a check item
obsolete. Update the copy after a host upgrade.

## How to update a tool

1. Copy the new files over the old files.
2. Change the version and the SHA-256 value in this file.
3. Run `pnpm run lint:docs` and `pnpm run plugin:check`.
