# memlens

memlens 是代理的长期记忆：一组受管理的笔记，上面是重述构成的树。

**状态：** 核心库、CLI、独立控制台和插件已实现。

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
| [packages/ui](packages/ui)                 | `@memlens/ui`         | 控制台的浏览器客户端。           |
| [packages/dsh-plugin](packages/dsh-plugin) | `@memlens/dsh-plugin` | DSH 插件。标识符 `dsh-memlens`。 |

## 文档

| 文件                                                               | 内容                     |
| ---------------------------------------------------------------- | ---------------------- |
| [docs/architecture.md](docs/architecture.md)                     | 系统的工作方式。               |
| [docs/configuration.md](docs/configuration.md)                   | 配置格式与示例。               |
| [docs/arch/README.md](docs/arch/README.md)                       | 以图表表示的架构模型。            |
| [docs/features/README.md](docs/features/README.md)               | 以场景描述的跨模块行为。           |
| [docs/questions.md](docs/questions.md)                           | 阻碍决策的开放问题。             |
| [AGENTS.md](AGENTS.md)                                           | 代理工作规则。                |

## 配置

memlens 无需配置文件即可工作。要修改某个值，把需要的部分复制到
`~/.config/memlens/config.toml`：

```toml
defaultProfile = "default"

[profile.default]
scopes = ["*"]

[profile.default.budget]
here = 20
directions = 10
```

DSH 插件读取同一个文件，并增加自己的两个层。全部键、默认值和示例见
[docs/configuration.md](docs/configuration.md)。

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
| `pnpm run build`     | 构建四个包。                  |
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
| README     | DSH 套件的八种语言。目前仓库中有英文、俄文（[README.ru.md](README.ru.md)）和中文（本文件）。 |
| 产品本地化 | DSH 套件的八种语言。 |
