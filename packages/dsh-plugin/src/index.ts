/**
 * The DeepSeek Harness plugin of memlens.
 *
 * The harness loads this module and calls `apply` with the plugin context.
 * The plugin registers nothing yet: the first registration comes after the
 * customer accepts a requirement. See docs/spec/03-open-questions.md, Q-002.
 */
import type { Context } from '@deepseek-ai/cordis'

/** The plugin identifier. The bundle row in cordis.patch.yml uses this name. */
export const name = 'dsh-memlens'

/**
 * Register the contributions of the plugin.
 *
 * Every registration must be an effect of the context. The harness then
 * removes the contributions when it unloads the plugin.
 */
export function apply(_ctx: Context): void {
  // No contribution yet.
}
