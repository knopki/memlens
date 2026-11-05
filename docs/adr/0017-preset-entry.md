# 0017. Preset entry

Status: replaced by 0065

## Context

The customer gave the two entry points and the merge. An agent preset needs its own settings.

## Decision

The plugin package has two entry points: `.` and `./preset`. A profile ties to a preset. The configuration merges the main part and the preset part.

## Alternatives

One entry point with a mode flag. A separate package for the preset.

## Consequences

One package serves both uses. D-065 replaces the merge rule.
