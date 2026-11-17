# Prompts

This file names the prompts of the product and the place of each one in the
code. It does not copy the text: the code holds the text, and a change of a word
is a change of the product.

| Prompt            | Place                                                          | Role                                                                 |
| ----------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| Slice template    | [context contract](../packages/core/src/domain/context.ts)     | The `<memory>` section with the placeholders `policy`, `append`, `directions`, `here`, and `scope`. |
| Policy text       | [context contract](../packages/core/src/domain/context.ts)     | The `<how-to>` part: the rules of a write, a read, and a review.      |
| Merge prompt      | [merge-line contract](../packages/core/src/domain/merge-line.ts) | The system prompt of a merge call, its batch form, and the task line. A map of the children, not a join. |
| Nudge texts       | [config types](../packages/core/src/domain/config-types.ts)    | One line of each counter, with `{n}` in place of the count. The section `[nudge]` overrides each text. |

## Templates

The slice is one template with five placeholders. The `customPrompt` key
replaces the whole template, and the placeholders apply in it. The
`customPromptAppend` key fills the `append` slot. The `<how-to>` part is never
cut, and the two other parts obey the line budgets of the profile.

## The subagent prompt

The design states a prompt for a subagent, and no source file holds it. See
[questions.md](questions.md#q-518).
