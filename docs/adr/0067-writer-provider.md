# 0067. Writer provider

Status: accepted

## Context

S-067 gives `provider: ""` and `model: ""` in the general config, and the preset sets only `model: deepseek-flash`. `ctx.llm.stream` needs a provider and a model.

## Decision

The writer takes the provider of the model route when `provider` is empty. A writer run with an empty model fails when the effort is not `off`.

## Alternatives

An empty provider is a load error. The writer uses the agent route.

## Consequences

The default config runs no writer, because the effort is `off`. A preset that turns the effort on must set the model.
