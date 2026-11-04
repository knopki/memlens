# @memlens/dsh-plugin

The DeepSeek Harness plugin of memlens.

**Status:** scaffold. The plugin registers no contribution yet. The first registration
comes after the customer accepts a requirement. See
[docs/spec/03-open-questions.md](../../docs/spec/03-open-questions.md), question Q-002.

## Contract

| Item | Value |
|---|---|
| Package | `@memlens/dsh-plugin` |
| Plugin identifier | `dsh-memlens` |
| Module exports | `name`, `apply` |
| Bundle patch | [cordis.patch.yml](cordis.patch.yml) |
| Display metadata | [locale/en.json](locale/en.json), [locale/ru.json](locale/ru.json), [locale/zh.json](locale/zh.json), [icon.svg](icon.svg) |
| Harness | DeepSeek Harness 0.2.1-rc.5 |
| Node | `^22.19.0 || >=24.0.0` |

## Build and test

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

Run `pnpm run plugin:check` in the repository root to check the bundle manifest.
