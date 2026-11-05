# 0047. Subagent mode

Status: accepted

## Context

A profile must give a subagent less than the parent, and one mode names the level.

## Decision

The subagent mode sets the access of a subagent. `propose` writes proposed notes and reports to the parent, `read` gives no writing tool, `off` gives no tool and no slice.

## Alternatives

One rule for each subagent. A permission for each tool.

## Consequences

The parent keeps the reports in `propose`. A subagent in `off` spends no slice bytes.
