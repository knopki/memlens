# 0064. Context injection

Status: accepted

## Context

A section change invalidates the whole cached prefix. `systemPrompt.context` is a durable user-role snapshot after the saved history, and the harness re-logs it only at a change or after compaction. The AGENTS.md loader uses `agent/pre-step` messages, not `agent.inject`. In 0.2.1-rc.5 `getContextOrder` names seven built-in contexts only, and `agentPreset` and `cwd` are on the session meta.

## Decision

The slice goes to `systemPrompt.context`, not to a system prompt section. The plugin registers one context for each agent at `agent/created`, with `required: true` and the order 220. The text stays the same until a trigger. The plugin reads it from the session history. It renders a new one at a fresh session, a compaction, and an idle time above the TTL. A process restart gives the same text.

## Alternatives

A system prompt section. `agent.inject` with a user message. A context order from `getContextOrder` with the plugin name.

## Consequences

The context survives a compaction and a restart. The plugin does not touch the system prompt. The order 220 puts the memory after the web surface context. The host gives no order slot for a new name.
