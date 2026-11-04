# @memlens/dsh-plugin

memlens 的 DeepSeek Harness 插件。

**状态：** 脚手架。插件目前不注册任何内容。第一次注册将在客户接受某条需求后进行。见
[docs/spec/03-open-questions.md](../../docs/spec/03-open-questions.md) 中的 Q-002。

## 契约

| 项目 | 值 |
|---|---|
| 包名 | `@memlens/dsh-plugin` |
| 插件标识符 | `dsh-memlens` |
| 模块导出 | `name`、`apply` |
| 打包补丁 | [cordis.patch.yml](cordis.patch.yml) |
| 展示元数据 | [locale/en.json](locale/en.json)、[locale/ru.json](locale/ru.json)、[locale/zh.json](locale/zh.json)、[icon.svg](icon.svg) |
| Harness | DeepSeek Harness 0.2.1-rc.5 |
| Node | `^22.19.0 || >=24.0.0` |

## 构建与测试

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

打包清单由测试检查。运行 `pnpm run test`。
