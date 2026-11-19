---
description: "The DeepSeek Harness plugin of memlens: the two entries, the memory context, the memory tools, the nudge, the compaction worker, and the console mount."
kind: "package-reference"
---

# @memlens/dsh-plugin

English | [中文](README.zh.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md) | [日本語](README.ja.md) | [Português](README.pt.md) | [Русский](README.ru.md)

## Summary

`@memlens/dsh-plugin` gives each DeepSeek Harness agent the memory of memlens. The host entry opens
one shared store. It gives each live agent the memory context, the memory tools, and the nudge. It
also starts the background worker that folds old notes into summary lines. The preset entry lets one
agent preset select its memory profile. The package mounts the console in the harness Web page as a
side panel and a session tab.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

### Install it

Add the package to the profile that you use:

```sh
dsh plugin --profile web add @memlens/dsh-plugin
```

The flag `--profile` names the profile, for example `web` or `desktop`. The command forwards the rest
of its arguments to pnpm in the profile directory.

The host entry requires the LLM service, because the worker sends the compaction calls through it.
The host entry declares the workspace service as optional.

### Entries

- The host entry is the module `@memlens/dsh-plugin`. The bundle patch inserts the row `memlens`, and
  that row id is what a profile overrides.
- The preset entry is the module `@memlens/dsh-plugin/preset`. An agent preset mounts it as the row
  `memlens/preset`.

The host entry declares the name `memlens`, and the preset entry declares the name `memlens/preset`.

#### Host row

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
```

#### Preset row

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
```

An absent key `profile` selects the profile `default`.

### Configure it

The table `config` of a row holds the settings of that layer. The example of the host row:

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

The example of the preset row:

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: work
    budget:
      here: 30
```

Each key is optional. A rejected value gives the empty layer, so a bad row changes no session.

The preset overrides the plugin patch. The plugin patch overrides the base profile. The preset key
`profile` selects the profile name. The preset accepts no compaction key and no store key.

The base file is `$XDG_CONFIG_HOME/memlens/config.toml`. If the file is absent, the built-in fallback
applies: the profile `default`, the scopes `*`, the budgets 20 and 10, and the scope `project:misc`.
An absent section of the file gives its default value. An invalid or unreadable file gives the
built-in fallback, and the store opens from it. The console shows the error, and a later valid file
applies with no restart.

The store path comes from the patch `store.path` first, then from `MEMLENS_STORE`, then from the base
file.

The background compaction needs a model route, and the plugin never picks a model. The keys
`provider` and `model` of the example give that route. The ids come from the LLM route of your
harness. A missing provider or model stops each pass with the error
`The compaction model is not configured. Set provider and model.`

See each key, its default, and full examples in [Configuration](../../docs/configuration.md).

### Authority rules

The main agent writes a note into the store. A child subagent writes a proposal instead. A write
outside the profile scopes becomes a proposal for a human. A `forget` outside the scopes writes a
hide proposal.

An `off` child gets no memory tool and no memory context. A child proposal collects under the session
id of the child. The parent receives one report line for each proposal when the child ends.

Only the CLI and the console amend, redact, accept, and dismiss. The store dismisses an expired
proposal with no human.

### Version

The lowest accepted version is DeepSeek Harness `0.2.2-rc.3`. The manifest accepts `>=0.2.2-rc.3`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the plugin holds the store and the surface of each agent. Read
[Use this package](#use-this-package) for the observable behavior.

### Design

The store is one SQLite database that keeps the notes of every session. The memory context, the
memory tools, and the nudge use the store. This section calls the set of these parts the surface of
an agent. To mount the surface means to register these parts in the context of one agent.

- **One store for the host.** The host opens the store once and shares it with every agent. The
  preset entry adds settings to one agent preset, and it starts no second store.
- **The open can fail.** To open the store means to read the configuration and to connect to the
  database. A missing directory or a database lock of another process stops the open. An invalid
  configuration file never stops the open: the read gives the built-in fallback, the store opens
  from it, and the console shows the error. The plugin keeps every session, mounts the surface that
  answers errors, and tries the open again after a wait. Each new try waits longer than the last.
- **The surface of each agent.** The host and the agent both own the surface of the agent, and each
  registration ends with the agent context. A child subagent gets no nudge, because the nudge asks
  for a memory write.
- **A store that is not open.** The context and the tools answer errors. A session with no saved
  context section gets no memory text, and the surface gets no nudge. The console shows the error of
  the store.
- **A store that opens later.** The plugin starts the worker and mounts the surface again for each
  live agent. A session that began on an unavailable store gets its memory later.
- **A second mount removes the old surface first.** The registries of the host reject a second
  registration of one name. A failed mount repeats with one second between, a small count of times,
  so a transient failure costs no surface. An exhausted mount logs the loss. The code and the debug
  log call this second mount a respawn.
- **The worker starts a pass at a trigger.** A pass starts when the dirty ranges reach the batch
  count. It also starts when the store idle time expires, and ten seconds after the start while work
  waits. The worker calls the configured route, keeps the hourly call limit, and records the recent
  events in a journal.
- **The console uses the Remote service.** The plugin registers the console namespace only when the
  Typert service is present. The tab then reads and writes the memory with no plugin HTTP route.

### Source map

| File                     | Role                                                                         |
| ------------------------ | ---------------------------------------------------------------------------- |
| `src/index.ts`           | The host entry: the store, the worker, the surface of each agent, the mount  |
| `src/preset.ts`          | The preset entry: the scoped configuration registration                      |
| `src/config.ts`          | The two settings schemas of the harness, with permissive leaves              |
| `src/service.ts`         | The shared store and the configuration of each agent preset                  |
| `src/runtime.ts`         | The base configuration and the active scope of a working directory           |
| `src/memory-context.ts`  | The memory context, the restore from the history, the refresh trigger        |
| `src/memory-tools.ts`    | The tool set of each agent mode, and the parent report of a child            |
| `src/nudge.ts`           | The two counters, the note-write reset, and the injected line                |
| `src/worker.ts`          | The compaction pass, the batch model call, the rate limit, the journal       |
| `src/tools/*.ts`         | One schema, one answer, and one renderer for each memory tool                |
| `src/console/*.ts`       | The console reads, the actions, the status, and the Remote service           |
| `src/client/*.tsx`       | The mount of the side panel and of the session tab                           |
| `locale/<language>.json` | The title and the description of each language in the plugin list            |
| `icon.svg`               | The panel icon                                                               |

The client body lives in `@memlens/ui`. This package holds the mount and the Remote service.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

This package is the harness entry of the memory. Read these pages for the state that it mounts.

- [Architecture](../../docs/architecture.md) — the store, the context, the tools, the worker, and
  the consoles in one place.
- [Agent tools](../../docs/features/agent-tools.feature) — the behavior of the memory tools.
- [Proposals](../../docs/features/proposals.feature) — the subagent modes and the proposal flow.
- [Memory context](../../docs/features/memory-context.feature) — the snapshot and its triggers.
- [Nudge](../../docs/features/nudge.feature) — the counters and the line.
- [Configuration](../../docs/configuration.md) — each key, its default, and the layer order.
- [Prompts](../../docs/prompts.md) — the prompts of the product and the place of each one.
- [Glossary](../../docs/glossary.md) — the terms of this package.

-----

<a id="model-experience"></a>
## Model Experience

### System prompt

#### What the model sees

The plugin registers the memory context for each agent with `required: true` and the order 220, after
the built-in runtime contexts. The harness writes the text as a runtime context message, and it
writes a new message only when the text changes.

The text is one `<memory>` section with these parts:

- `<how-to>` holds the policy text and the value of `customPromptAppend`. The key `customPrompt`
  replaces the whole template.
- `<directions>` holds one line for each of the newest scopes of the profile, as
  `[<key>] <age> <summary>`. The scopes older than the budget join into one list of keys.
- `<here>` holds the frontier of the active scope, as `#<pos> <date> <body>` for a note and
  `#<a>-<b> <start>..<end> <summary>` for a range.

The policy text states the shape of the tree, the two read tools, and the rules of a write. The
[context contract](../../packages/core/src/domain/context.ts) holds the text, and
[Prompts](../../docs/prompts.md) names its place.

#### Token effect

A fixed cost on each request that holds the memory context. The cost grows with the budgets `here`
and `directions`, and with the value of `customPromptAppend`.

#### KV Cache effect

The memory text sits in the runtime context at the start of the request. It stays the same through
the turns of a session and through the writes of that session. This section is prefix-stable for the
whole session.

The plugin renders the text again at a new session and at a compaction of the conversation by the
harness. The text changes only when the notes, the budgets, or the custom prompt change.

### Tool schemas and results

#### What the model sees

The tool definitions in the agent scope, with the descriptions, the parameters, and the answer
schemas of `src/tools`. The set of each agent depends on the mode of the profile:

| Tool            | Main agent | `propose` child | `read` child |
| --------------- | ---------- | --------------- | ------------ |
| `memory_note`   | yes        | yes, proposal   | no           |
| `memory_find`   | yes        | yes             | yes          |
| `memory_open`   | yes        | yes             | yes          |
| `memory_map`    | yes        | yes             | yes          |
| `memory_forget` | yes        | no              | no           |
| `memory_review` | yes        | no              | no           |

An `off` child gets no tool and no memory context.

Each call answers with one rendered text. The table gives the text of each tool:

| Tool            | The text that the model reads                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------ |
| `memory_note`   | `saved <addr>`, or `Proposed to your parent: <body> (proposal <id>)`                             |
| `memory_find`   | One line for each hit, as `<addr>  <date>  <kind>  <body>`, or `No hit.`                         |
| `memory_open`   | The entry with its longform, one line for each child of a range, or `The range holds no record.` |
| `memory_map`    | One line for each scope, or one line for each range of the frontier                              |
| `memory_forget` | `Done. A target outside the profile waits for a human.`                                          |
| `memory_review` | One line for each due record, or `reviewed <count> records, next <date>`                         |

#### Token effect

A fixed schema cost plus one compact answer for each call. The parent report adds one line for each
open proposal of a child when the child ends.

#### KV Cache effect

The schemas are prefix-stable while the tool set and the mode of the profile stay unchanged. A call
and its answer append after the reusable prefix.

### Nudge lines

#### What the model sees

The plugin counts the tool calls and the turns of the main agent. A counter that reaches its limit
injects one user-role line. The line holds `{n}`, and the count takes its place. The default texts
are:

```text
[memory] {n} tool calls since the last record. Anything durable: a decision, a correction, a preference, a failed attempt and its cause?
[memory] {n} turns since the last record. Anything durable: a decision, a correction, a preference, a failed attempt and its cause?
```

The `[nudge]` section of the configuration gives the counts and the texts. A limit of zero or less
disables its counter.

#### Token effect

One short line at each reached limit. A note write or a nudge resets both counters, so the lines stay
rare.

#### KV Cache effect

The line appends after the reusable prefix, so it invalidates no earlier entry.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

These limits define when this package is a poor fit or needs special care. They are current package
constraints, not a task backlog.

- **The compaction needs a configured route.** A pass with no provider or no model fails with "The
  compaction model is not configured. Set provider and model." The console shows that error in the
  maintenance screen, and the affected ranges stay dirty for the next pass. See
  [Configure it](#configure-it).
- **A second mount has a bounded count of attempts.** The plugin removes the old surface first, then
  mounts again with one second between. An exhausted mount logs the loss, and the agent stays without
  a surface until the next trigger.
- **The nudge counts the main agent only.** A subagent gets no nudge, and no reminder to record a
  finding.
- **The console needs the Typert service.** The namespace registers only when the service appears. A
  profile without the Web gateway gets no console, and the plugin reports no error.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers. It is explicitly non-authoritative.

The console of the harness GUI looks like a part of `@memlens/ui`, but the split is not clean. This
package holds the mount, the Remote service, the reads, and the actions. The client body holds the
model, the store, the screens, and the translations. A change of a console screen touches both
packages. A change of a console call touches `src/console/remote-contract.ts` first, because both
faces of the Remote read the same descriptors.

The build and the checks:

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

The command `pnpm run verify` at the root of the repository runs the build and every check.

</details>
