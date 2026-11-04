# memlens

memlens 是代理的长期记忆：一组受管理的笔记，上面是重述构成的树。

**状态：** 规范阶段。脚手架可以构建，测试通过。目前没有任何部分完成实际工作。

## 组成部分

| 部分     | 功能                           |
| -------- | ------------------------------ |
| 无头库   | 完成主要工作。没有用户界面。   |
| CLI 前端 | 从终端提供访问。               |
| DSH 插件 | 从 DeepSeek Harness 提供访问。 |

## 目录结构

| 路径                                       | 包                    | 角色                             |
| ------------------------------------------ | --------------------- | -------------------------------- |
| [packages/core](packages/core)             | `@memlens/core`       | 无头库。                         |
| [packages/cli](packages/cli)               | `@memlens/cli`        | CLI 前端。可执行文件 `memlens`。 |
| [packages/dsh-plugin](packages/dsh-plugin) | `@memlens/dsh-plugin` | DSH 插件。标识符 `dsh-memlens`。 |

## 文档

| 文件                                                             | 内容                   |
| ---------------------------------------------------------------- | ---------------------- |
| [docs/spec/README.md](docs/spec/README.md)                       | 规范的目录与维护规则。 |
| [docs/spec/02-requirements.md](docs/spec/02-requirements.md)     | 带标识符和状态的需求。 |
| [docs/spec/03-open-questions.md](docs/spec/03-open-questions.md) | 阻塞工作的未决问题。   |
| [docs/statements.md](docs/statements.md)                         | 客户的原始陈述。       |
| [AGENTS.md](AGENTS.md)                                           | 代理工作规则。         |

## 安装

```sh
mise install
pnpm install
prek install
```

[mise.toml](mise.toml) 设定工具的版本线：`mise install` 在每条线中安装一个版本，`mise upgrade` 升级到最新的补丁版本。

## 命令

在由 mise 激活的 shell 中运行命令，或以 `mise exec --` 开头运行单条命令。

| 命令                 | 作用                          |
| -------------------- | ----------------------------- |
| `pnpm install`       | 安装工作区。                  |
| `pnpm run build`     | 构建三个包。                  |
| `pnpm run typecheck` | 检查类型。                    |
| `pnpm run test`      | 运行测试。                    |
| `pnpm run lint`      | 用 biome 检查代码与格式。     |
| `pnpm run format`    | 写入 biome 修复与格式化结果。 |
| `pnpm run lint:docs` | 按 STE 限制检查文档。         |
| `pnpm run verify`    | 运行构建和全部检查。          |

## 语言

| 项目       | 语言                                                       |
| ---------- | ---------------------------------------------------------- |
| 文档       | Simplified Technical English，ASD-STE100。                 |
| 代码注释   | Simplified Technical English，ASD-STE100。                 |
| README     | 英文、俄文（[README.ru.md](README.ru.md)）、中文（本文件） |
| 产品本地化 | 俄文和中文。                                               |

## 下一步

尚未确定：scope 的结构、方向图的形式和快照的字段。
见 [Q-009](docs/spec/03-open-questions.md#q-009) 及后续问题。
