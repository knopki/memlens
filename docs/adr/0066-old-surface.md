# 0066. Old surface

Status: replaced by 0070

## Context

The customer gave the tool names and the slice text. The old surface used `write` and `hide`. The `<how-to>` tag is absent from the new text. The tiling example is a complete cover of the range.

## Decision

The agent surface is `memory_find`, `memory_open`, `memory_note`, and `memory_forget`. `memory_review` stays. `memory_note` takes `body`, `longform`, `scope`, `kind`, and `supersedes`, and it takes no `reviewIn`. The slice is one `<memory>` block with the policy text at the head, then `<directions>`, then `<here>`. A direction line gives the scope, the age or `active`, the count of notes, and the description. `memory_find` gives the matching lines with their addresses. `memory_open` of a node gives its two child lines.

## Alternatives

Keep `write` and `hide`. Keep the `<how-to>` tag. Return the raw records of a range from `memory_open`.

## Consequences

The old names leave the tool list. The policy text is not a tag. A review date comes from the `review` event. A nested block opens into two lines. D-070 replaces this decision.
