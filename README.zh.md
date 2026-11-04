# memlens

memlens 是一个无头库（headless library），带一个 CLI 前端和一个 DSH 插件。

**状态：** 规范阶段。脚手架可以构建，测试通过。目前没有任何部分完成实际工作。

## 组成部分

| 部分 | 功能 |
|---|---|
| 无头库 | 完成主要工作。没有用户界面。 |
| CLI 前端 | 从终端提供访问。 |
| DSH 插件 | 从 DeepSeek Harness 提供访问。 |

## 目录结构

| 路径 | 包 | 角色 |
|---|---|---|
| [packages/core](packages/core) | `@memlens/core` | 无头库。 |
| [packages/cli](packages/cli) | `@memlens/cli` | CLI 前端。可执行文件 `memlens`。 |
| [packages/dsh-plugin](packages/dsh-plugin) | `@memlens/dsh-plugin` | DSH 插件。标识符 `dsh-memlens`。 |

## 文档

| 文件 | 内容 |
|---|---|
| [docs/spec/README.md](docs/spec/README.md) | 规范的目录与维护规则。 |
| [docs/spec/02-requirements.md](docs/spec/02-requirements.md) | 带标识符和状态的需求。 |
| [docs/spec/03-open-questions.md](docs/spec/03-open-questions.md) | 阻塞工作的未决问题。 |
| [docs/statements.md](docs/statements.md) | 客户的原始陈述。 |
| [AGENTS.md](AGENTS.md) | 代理工作规则。 |

## 命令

| 命令 | 作用 |
|---|---|
| `pnpm install` | 安装工作区。 |
| `pnpm run build` | 构建三个包。 |
| `pnpm run typecheck` | 检查类型。 |
| `pnpm run test` | 运行测试。 |
| `pnpm run plugin:check` | 检查插件清单。 |
| `pnpm run lint:docs` | 按 STE 限制检查文档。 |

## 语言

| 项目 | 语言 |
|---|---|
| 文档 | Simplified Technical English，ASD-STE100。 |
| 代码注释 | Simplified Technical English，ASD-STE100。 |
| README | 英文、俄文（[README.ru.md](README.ru.md)）、中文（本文件） |
| 产品本地化 | 俄文和中文。 |

## 下一步

产品功能尚未确定。见 [Q-002](docs/spec/03-open-questions.md#q-002)。
