# @memlens/dsh-plugin

memlens 的 DeepSeek Harness 插件。

**状态：** 阶段 1 到 4。插件打开记忆存储，为每个智能体提供记忆上下文、记忆工具和提示，并运行后台压缩。插件控制台留在这个包之外。

## 记忆功能范围

插件为每个智能体注册一个运行时上下文。上下文持有记忆切片，并在被接受的触发之间保持稳定：新会话、一次成功的 harness 压缩，以及高于模型 TTL 的空闲时间。

插件在每个智能体的上下文中注册这些工具：

| 工具          | 主智能体 | 子（提案） | 子（读取） |
| ------------- | -------- | ---------- | ---------- |
| memory_note   | 是       | 是，提案   | 否         |
| memory_find   | 是       | 是         | 是         |
| memory_open   | 是       | 是         | 是         |
| memory_map    | 是       | 是         | 是         |
| memory_forget | 是       | 否         | 否         |
| memory_review | 是       | 否         | 否         |

`off` 子智能体不获得记忆工具，也不获得记忆上下文。子智能体的提案收集在子会话 id 之下，子智能体结束时，父级收到每个提案一行报告。

提示统计主智能体的工具调用和轮次。达到上限时插入一行，写入笔记或提示会重置两个计数器。

后台工作器在脏阈值和存储空闲上限启动压缩。工作器调用配置的 LLM 路由，并遵守其调用上限。

## 入口

- 宿主入口 `@memlens/dsh-plugin` 的插件名是 `dsh-memlens`。打包补丁插入行 `memlens`。
- 预设入口 `@memlens/dsh-plugin/preset` 的插件名是 `memlens/preset`。智能体预设用键 `profile` 加载它。

### 宿主行

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
```

### 预设行

把这个行加入智能体预设的 `plugins` 列表。键 `profile` 是可选的。省略时使用配置文件 `default`。

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: default
```

## 配置

插件读取基础文件 `$XDG_CONFIG_HOME/memlens/config.toml`。插件不写这个文件。如果文件不存在，内置回退生效：配置文件 `default`、作用域 `*`、预算 20 和 10、作用域 `user:notes`。

存储路径先来自插件配置，然后来自 `MEMLENS_STORE`，然后来自基础文件。

设置按这个顺序合并：预设、插件补丁、基础配置文件。预设键 `profile` 选择配置文件名。

展示元数据在 `locale/<language>.json` 中。图标是 `icon.svg`。

## 构建与测试

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

## 版本

接受的最低版本是 DeepSeek Harness `0.2.2-rc.3`。清单接受 `>=0.2.2-rc.3`。
