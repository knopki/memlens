# @memlens/dsh-plugin

[English](README.md) | 中文 | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md) | [日本語](README.ja.md) | [Português](README.pt.md) | [Русский](README.ru.md)

memlens 是代理的长期记忆。笔记放在一个 SQLite 存储里，其上是一棵摘要树。这个包把这套记忆提供给
DeepSeek Harness 的各个智能体。问题、设计、CLI 和控制台见
[主 README](https://github.com/knopki/memlens/blob/HEAD/README.md)。

<p align="center">
  <img src="https://raw.githubusercontent.com/knopki/memlens/HEAD/docs/images/dsh-plugin-hero.png" width="640" alt="穿女仆装的鲸鱼娘把两张长便签熨成一张短便签，头顶挂着一串折叠的便签。">
</p>

## 概要

`@memlens/dsh-plugin` 为每个 DeepSeek Harness 智能体提供 memlens 的记忆。宿主入口打开一个共享存储（store）。它为每个活跃智能体提供记忆上下文、记忆工具和提醒（nudge）。它还启动后台工作进程，把旧笔记折叠成摘要行。预设入口让一个智能体预设选择自己的记忆配置档。这个包把控制台以侧边面板和会话标签页的形式挂载到 harness 的 Web 页面里。

## 目录

- [使用这个包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与推迟的工作](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## 使用这个包

### 安装

把这个包加入你使用的配置档：

```sh
dsh plugin --profile web add @memlens/dsh-plugin
```

旗标 `--profile` 指定配置档，例如 `web` 或 `desktop`。这条命令把其余参数转发给配置档目录中的 pnpm。

宿主入口需要 LLM 服务，因为工作进程通过它发送压缩调用。宿主入口把工作区服务声明为可选。

### 入口

- 宿主入口是模块 `@memlens/dsh-plugin`。打包补丁插入行 `memlens`，配置档覆盖的正是这个行 id。
- 预设入口是模块 `@memlens/dsh-plugin/preset`。智能体预设把它作为行 `memlens/preset` 挂载。

宿主入口声明名字 `memlens`，预设入口声明 `memlens/preset`。

#### 宿主行

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
```

#### 预设行

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
```

缺少键 `profile` 时，选中配置档 `default`。

### 配置

一行的 `config` 表持有该层的设置。宿主行的例子：

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
      config:
        defaultProfile: work
        budget:
          here: 40
        compaction:
          provider: deepseek-official
          model: deepseek-flash
```

预设行的例子：

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: work
    budget:
      here: 30
```

每个键都是可选的。被拒绝的值给出空层，因此错误的行不改变任何会话。

预设覆盖插件补丁。插件补丁覆盖基础配置档。预设键 `profile` 选择配置档名。预设不接受压缩键，也不接受存储键。

基础文件是平台配置目录中的 `config.toml`。文件不存在时，应用内置回退：配置档 `default`、作用域 `*`、预算 20 和 10，以及作用域 `project:misc`。文件里缺少的节取其默认值。无效或不可读的基础文件让存储保持关闭，会话继续。

存储路径先取自补丁的 `store.path`，再取自 `MEMLENS_STORE`，最后取自基础文件。

后台压缩需要一条模型路由，插件从不自己挑选模型。例子中的键 `provider` 和 `model` 给出这条路由。id 来自你的 harness 的 LLM 路由。缺少 provider 或 model 时，每一轮都以下面的错误停下：`The compaction model is not configured. Set provider and model.`

每个键、其默认值和完整例子见[配置](../../docs/configuration.md)。

### 权限规则

主智能体把笔记写入存储。子智能体改为写提案。配置档作用域之外的写入变成给人的提案。作用域之外的 `forget` 写入隐藏提案。

`off` 子智能体得不到记忆工具，也得不到记忆上下文。子智能体的提案收集在子智能体的会话 id 之下。子智能体结束时，父级收到每个提案各一行报告。

只有 CLI 和控制台能修订、抹除、接受和驳回。过期的提案由存储在没有人的情况下驳回。

### 版本

可接受的最低版本是 DeepSeek Harness `0.2.2-rc.3`。包清单接受 `>=0.2.2-rc.3 <0.3.0-0`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部 — 点击展开</summary>

本节说明插件如何持有存储，以及每个智能体的接口面。可观察的行为见[使用这个包](#use-this-package)。

### 设计

存储是一个 SQLite 数据库，持有每个会话的笔记。记忆上下文、记忆工具和提醒都使用这个存储。本节把这几部分合称智能体的接口面（surface）。挂载（mount）接口面指在一个智能体的上下文里注册这几部分。

- **宿主只有一个存储。** 宿主打开存储一次，并与每个智能体共享。预设入口只给一个智能体预设增加设置，不启动第二个存储。
- **打开可能失败。** 打开存储指读取配置并连接数据库。目录不存在、另一个进程持有数据库锁，或配置文件无效，都会让打开停止。插件保留每个会话，挂载回答错误的接口面，并在等待之后重试打开。每次新的重试等待都比上一次长。
- **每个智能体的接口面。** 宿主和智能体都持有该智能体的接口面，每个注册都随智能体上下文结束。子智能体得不到提醒，因为提醒要求写入记忆。
- **未打开的存储。** 上下文和工具都回答错误。没有已保存上下文节的会话得不到记忆文本，接口面也得不到提醒。控制台显示存储的错误。
- **稍后才打开的存储。** 插件启动工作进程，并再次为每个活跃智能体挂载接口面。在存储不可用时开始的会话，稍后得到它的记忆。
- **第二次挂载先移除旧接口面。** 宿主的注册表拒绝同一个名字的第二次注册。失败的挂载以一秒间隔重试，次数很少，因此瞬时故障不损失接口面。耗尽的挂载记录这次损失。代码和调试日志把第二次挂载称为 respawn。
- **工作进程在触发点启动一轮。** 脏区间达到批次数量时，一轮开始。存储空闲时间到期时也开始，有工作等待时在开始后十秒开始。工作进程调用已配置的路由，遵守每小时调用上限，并把最近的事件记录到日志。
- **控制台使用 Remote 服务。** 只有当 Typert 服务存在时，插件才注册控制台命名空间。此后标签页在没有任何插件 HTTP 路由的情况下读写记忆。

### 源码地图

| 文件                     | 作用                                               |
| ------------------------ | -------------------------------------------------- |
| `src/index.ts`           | 宿主入口：存储、工作进程、每个智能体的接口面、挂载 |
| `src/preset.ts`          | 预设入口：按作用域配置的注册                       |
| `src/config.ts`          | harness 的两个设置 schema，叶子键宽松              |
| `src/service.ts`         | 共享存储和每个智能体预设的配置                     |
| `src/runtime.ts`         | 基础配置和工作目录的活动作用域                     |
| `src/memory-context.ts`  | 记忆上下文、从历史恢复、刷新触发点                 |
| `src/memory-tools.ts`    | 每个智能体模式的工具集，以及子智能体的父级报告     |
| `src/nudge.ts`           | 两个计数器、笔记写入重置，以及注入的行             |
| `src/worker.ts`          | 压缩轮次、批次模型调用、速率限制、日志             |
| `src/tools/*.ts`         | 每个记忆工具一个 schema、一个应答和一个渲染器      |
| `src/console/*.ts`       | 控制台读取、操作、状态，以及 Remote 服务           |
| `src/client/*.tsx`       | 侧边面板和会话标签页的挂载                         |
| `locale/<language>.json` | 插件列表中每种语言的标题和描述                     |
| `icon.svg`               | 面板图标                                           |

客户端主体位于 `@memlens/ui`。这个包持有挂载和 Remote 服务。

</details>

-----

<a id="further-exploration"></a>
## 进一步阅读

这个包是记忆的 harness 入口。它挂载的状态见以下页面。

- [架构](../../docs/architecture.md) — 存储、上下文、工具、工作进程和控制台都在一处。
- [智能体工具](../../docs/features/agent-tools.feature) — 记忆工具的行为。
- [提案](../../docs/features/proposals.feature) — 子智能体模式和提案流程。
- [记忆上下文](../../docs/features/memory-context.feature) — 快照及其触发点。
- [提醒](../../docs/features/nudge.feature) — 计数器和那一行。
- [配置](../../docs/configuration.md) — 每个键、其默认值和层顺序。
- [提示词](../../docs/prompts.md) — 产品的提示词和每个提示词的位置。
- [术语表](../../docs/glossary.md) — 这个包的术语。

-----

<a id="model-experience"></a>
## 模型体验

### 系统提示词

#### 模型看到的内容

插件为每个智能体注册记忆上下文，带 `required: true` 和顺序 220，排在内置运行时上下文之后。harness 把这段文本写成运行时上下文消息，只在文本变化时写一条新消息。

这段文本是一个 `<memory>` 节，包含以下几部分：

- `<how-to>` 持有策略文本和 `customPromptAppend` 的值。键 `customPrompt` 替换整个模板。
- `<directions>` 为配置档里最新的作用域各持一行，形如 `[<key>] <age> <summary>`。早于预算的作用域并进一个键列表。
- `<here>` 持有活动作用域的前沿，笔记形如 `#<pos> <date> <body>`，区间形如 `#<a>-<b> <start>..<end> <summary>`。

策略文本说明树的形状、两个读取工具，以及写入的规则。[上下文契约](../../packages/core/src/domain/context.ts)持有这段文本，[提示词](../../docs/prompts.md)指明它的位置。

#### Token 影响

每个持有记忆上下文的请求都有固定开销。开销随预算 `here` 和 `directions` 增长，也随 `customPromptAppend` 的值增长。

#### KV Cache 影响

记忆文本位于请求开头的运行时上下文里。它在会话的各轮次中、在该会话的写入过程中都保持不变。这一节在整个会话里前缀稳定。

插件在新会话时，以及 harness 压缩对话时，重新渲染这段文本。只有笔记、预算或自定义提示词变化时，文本才变。

### 工具 schema 与结果

#### 模型看到的内容

智能体作用域里的工具定义，含 `src/tools` 的描述、参数和应答 schema。每个智能体的工具集取决于配置档的模式：

| 工具            | 主智能体 | `propose` 子智能体 | `read` 子智能体 |
| --------------- | -------- | ------------------ | --------------- |
| `memory_note`   | 是       | 是，提案           | 否              |
| `memory_find`   | 是       | 是                 | 是              |
| `memory_open`   | 是       | 是                 | 是              |
| `memory_map`    | 是       | 是                 | 是              |
| `memory_forget` | 是       | 否                 | 否              |
| `memory_review` | 是       | 否                 | 否              |

`off` 子智能体得不到工具，也得不到记忆上下文。

每次调用以一个渲染后的文本作答。下表给出每个工具的文本：

| 工具            | 模型读到的文本                                                        |
| --------------- | --------------------------------------------------------------------- |
| `memory_note`   | `saved <addr>`，或 `Proposed to your parent: <body> (proposal <id>)`  |
| `memory_find`   | 每个命中一行，形如 `<addr>  <date>  <kind>  <body>`，或 `No hit.`     |
| `memory_open`   | 带 longform 的条目、区间每个子项一行，或 `The range holds no record.` |
| `memory_map`    | 每个作用域一行，或前沿的每个区间一行                                  |
| `memory_forget` | `Done. A target outside the profile waits for a human.`               |
| `memory_review` | 每条到期记录一行，或 `reviewed <count> records, next <date>`          |

#### Token 影响

固定的 schema 开销，加上每次调用一个紧凑的应答。子智能体结束时，父级报告为子智能体的每个未结提案增加一行。

#### KV Cache 影响

工具集和配置档的模式不变时，schema 前缀稳定。调用及其应答追加在可复用的前缀之后。

### 提醒行

#### 模型看到的内容

插件统计主智能体的工具调用和轮次。计数器达到上限时，注入一行 user 角色的内容。这一行持有 `{n}`，计数取代它的位置。
默认行要求智能体只为后续会话需要、且一分钟内找不到的内容写笔记。没有符合的内容时，智能体忽略这一行。

配置的 `[nudge]` 节给出次数和文本。上限为零或更小时，禁用对应的计数器。

#### Token 影响

每次达到上限时一行短文本。写入笔记或一次提醒都会重置两个计数器，因此这些行保持稀少。

#### KV Cache 影响

这一行追加在可复用的前缀之后，因此不让更早的条目失效。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与推迟的工作

这些限制界定这个包何时不合适、何时需要特别处理。它们是当前的包约束，不是任务清单。

- **压缩需要已配置的路由。** 没有 provider 或没有 model 时，一轮压缩失败，报错 "The compaction model is not configured. Set provider and model."。控制台在维护界面显示该错误，受影响的区间保持脏，等下一轮。见[配置](#configure-it)。
- **第二次挂载的次数有限。** 插件先移除旧接口面，再以一秒间隔重新挂载。耗尽的挂载记录这次损失，智能体在下一个触发点之前一直没有接口面。
- **提醒只统计主智能体。** 子智能体得不到提醒，也得不到记录发现的提示。
- **控制台需要 Typert 服务。** 只有当服务出现时，命名空间才注册。没有 Web 网关的配置档得不到控制台，插件也不报错。

<a id="dev-note"></a>
### 开发说明

<details>
<summary>维护者的工作上下文 — 点击展开</summary>

本开发说明是维护者的工作上下文。它明确不具权威性。

harness GUI 的控制台看起来是 `@memlens/ui` 的一部分，但这条分界并不干净。这个包持有挂载、Remote 服务、读取和操作。客户端主体持有模型、存储、屏幕和翻译。控制台屏幕的改动会同时触及两个包。控制台调用的改动先触及 `src/console/remote-contract.ts`，因为 Remote 的两个面都读同一批描述符。

构建和检查：

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

仓库根目录的命令 `pnpm run verify` 运行构建和所有检查。

</details>
