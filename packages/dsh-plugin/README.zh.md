# @memlens/dsh-plugin

memlens 的 DeepSeek Harness 插件。

**状态：** 阶段 1。插件打开记忆存储，并为每个会话读取配置。它还没有记忆工具和记忆上下文。

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

把这个行加入智能体预设的 `plugins` 列表。键 `profile` 是必需的。

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

会话模型至少需要 65 536 个上下文令牌。插件会停止模型更小的会话。

展示元数据在 `locale/<language>.json` 中。图标是 `icon.svg`。

## 构建与测试

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

## 版本

已测试版本是 DeepSeek Harness `0.2.2-rc.3`。清单接受 `>=0.2.1-0`。更旧的版本未验证。
