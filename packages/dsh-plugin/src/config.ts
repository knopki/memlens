/**
 * The harness configuration schemas of memlens.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Let the harness validate the bundle row and the agent preset with the core load rules,
 * and show the fields of each layer to the user.
 * @scope
 *  - The two schemas, their field metadata, and the strict check of the raw value.
 *  - NOT: the merge, the defaults, the store, and the registration.
 * @invariants
 *  - Each schema returns the layer of the core. An omitted field stays absent.
 *  - The core loader reads the raw value before a declared field reads the value.
 * @dependencies USES API: @deepseek-ai/schemastery, @memlens/core
 * @keywords dsh, plugin, config, schema, patch, preset, schemastery
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import z from "@deepseek-ai/schemastery";
import {
	loadPatchConfig,
	loadPresetConfig,
	type PatchConfig,
	type PresetConfig,
} from "@memlens/core";

const debug = debuglog("memlens:plugin:config");

/**
 * @purpose Give the field no value when the row omits it, so the layer keeps the field absent.
 * @param schema - A field schema that sets an empty value by default.
 * @returns The same schema without that default.
 */
function withoutEmptyDefault<T extends { meta: { default?: unknown } }>(
	schema: T,
): T {
	delete schema.meta.default;
	return schema;
}

const budgetFields = withoutEmptyDefault(
	z.object({ here: z.number(), directions: z.number() }),
);

const compactionFields = withoutEmptyDefault(
	z.object({
		provider: z.string(),
		model: z.string(),
		effort: z.string(),
		mode: z.string(),
		batch: z.number(),
		maxCallsPerHour: z.number(),
	}),
);

const nudgeFields = withoutEmptyDefault(
	z.object({
		tool_calls: z.number(),
		turns: z.number(),
		text: withoutEmptyDefault(z.dict(z.string())),
	}),
);

// #region FUNC_readPatchLayer
/**
 * @purpose Validate the raw row value with the strict patch rule of the core.
 * @param value - The raw `config` of the bundle row.
 * @returns The patch layer. Each omitted key stays absent.
 */
function readPatchLayer(value: unknown): PatchConfig {
	const layer = loadPatchConfig(value);
	debug("Patch layer accepted", { event: "schema", keys: Object.keys(layer) });
	return layer;
}
// #endregion FUNC_readPatchLayer

// #region FUNC_PatchConfigSchema
/**
 * @purpose Expose host settings while the core checks raw input before field parsing.
 * The schema of the bundle row.
 *
 * The transform branch reads the raw value. The core loader rejects each unknown key and each
 * invalid value. The object branch declares the fields for the harness. The merge keeps each value
 * of the loader. Each nested object drops its empty default, so an omitted field stays absent.
 */
export const PatchConfigSchema: z<PatchConfig> = z.intersect([
	z.transform(z.any(), readPatchLayer),
	z.object({
		store: withoutEmptyDefault(
			z.object({ path: z.string(), idle: z.number() }),
		),
		defaultProfile: z.string(),
		budget: budgetFields,
		compaction: compactionFields,
		nudge: nudgeFields,
		cacheTtl: withoutEmptyDefault(z.dict(z.string())),
		customPrompt: z.string(),
		customPromptAppend: z.string(),
	}),
]);
// #endregion FUNC_PatchConfigSchema

// #region FUNC_readPresetLayer
/**
 * @purpose Validate the raw preset value with the strict preset rule of the core.
 * @param value - The raw `config` of the preset row.
 * @returns The preset layer. The key `profile` is mandatory.
 */
function readPresetLayer(value: unknown): PresetConfig {
	const layer = loadPresetConfig(value);
	debug("Preset layer accepted", { event: "schema", keys: Object.keys(layer) });
	return layer;
}
// #endregion FUNC_readPresetLayer

// #region FUNC_PresetConfigSchema
/**
 * @purpose Expose preset settings while the core checks the required profile and raw fields.
 * The schema of the preset entry.
 *
 * The branches follow the rule of the bundle row. The object branch marks `profile` as required,
 * and the core loader states its absence first.
 */
export const PresetConfigSchema: z<PresetConfig> = z
	.intersect([
		z.transform(z.any(), readPresetLayer),
		z.object({
			profile: z.string().required(),
			budget: budgetFields,
			compaction: compactionFields,
			nudge: nudgeFields,
			customPrompt: z.string(),
			customPromptAppend: z.string(),
		}),
	])
	.required();
// #endregion FUNC_PresetConfigSchema
