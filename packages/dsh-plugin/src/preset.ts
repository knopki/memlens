/**
 * #region moduleContract
 * @purpose Let one DSH agent preset select its memory profile without replacing the shared host store.
 * @scope The preset entry, schema, dependency declaration, and scoped configuration registration.
 * @invariants The host supplies the store and base configuration. The preset supplies no service instance.
 * @dependencies USES API: @deepseek-ai/cordis, @memlens/core
 * @keywords preset, configuration, profile, memlens, registration
 * #endregion moduleContract
 */

import type { Context } from "@deepseek-ai/cordis";
import type { PresetConfig } from "@memlens/core";
import { PresetConfigSchema } from "./config.js";
import type {} from "./service.js";

/** The settings schema of the preset contribution. */
export const Config = PresetConfigSchema;

export type Config = PresetConfig;

/** The diagnostic name of the preset contribution. */
export const name = "memlens/preset";

/** The host service must exist before this preset contribution starts. */
export const inject = ["memlens"];

// #region FUNC_apply
/**
 * @purpose Register the caller's memory settings under its agent preset scope.
 * @param ctx - The scoped context of the preset plugin.
 * @param config - The validated preset configuration.
 */
export function apply(ctx: Context, config: Config): void {
	ctx.memlens.registerPreset(config);
}
// #endregion FUNC_apply
