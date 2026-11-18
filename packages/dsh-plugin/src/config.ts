/**
 * The harness configuration schemas of memlens.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Let the harness show the fields of each layer, and give the plugin a layer that no
 * row value can reject.
 * @scope
 *  - The two schemas and their field metadata.
 *  - NOT: the merge, the defaults, the store, and the registration.
 * @invariants
 *  - The transform branch reads the raw value with the strict core rule. A rejected value gives
 *    the empty layer, so no row value blocks a session.
 *  - The object branch declares each field with permissive leaves. It states the shape for the
 *    settings page and never rejects a value.
 *  - The service re-reads the merged result with the strict core rule and drops a rejected layer.
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

// #region FUNC_withoutEmptyDefault
/**
 * @purpose Give the field no value when the row omits it, so the layer keeps the field absent.
 * @invariants The call edits the schema that it receives, and gives the same object.
 */
function withoutEmptyDefault<T extends { meta: { default?: unknown } }>(
	schema: T,
): T {
	delete schema.meta.default;
	return schema;
}
// #endregion FUNC_withoutEmptyDefault

const budgetFields = withoutEmptyDefault(
	z.object({ here: z.any(), directions: z.any() }),
);

const compactionFields = withoutEmptyDefault(
	z.object({
		provider: z.any(),
		model: z.any(),
		effort: z.any(),
		batch: z.any(),
		maxCallsPerHour: z.any(),
	}),
);

const nudgeFields = withoutEmptyDefault(
	z.object({
		tool_calls: z.any(),
		turns: z.any(),
		text: withoutEmptyDefault(z.dict(z.any())),
	}),
);

// #region FUNC_readPatchLayer
/**
 * @purpose Validate the raw row value with the strict patch rule of the core.
 * @invariants A rejected row value gives the empty layer, so one broken row blocks no session.
 * @param value - The raw `config` of the bundle row.
 * @returns The patch layer. Each omitted key stays absent.
 */
function readPatchLayer(value: unknown): PatchConfig {
	try {
		const layer = loadPatchConfig(value ?? {});
		debug("Patch layer accepted", {
			event: "schema",
			keys: Object.keys(layer),
		});
		return layer;
	} catch (error) {
		debug("Patch layer rejected; the empty layer applies", {
			event: "schema-reject",
			error: String(error),
		});
		return {};
	}
}
// #endregion FUNC_readPatchLayer

// #region FUNC_PatchConfigSchema
/**
 * @purpose Expose host settings and give the plugin one layer that no row value rejects.
 * The schema of the bundle row.
 *
 * The transform branch validates the raw value with the core rule and drops a rejected layer.
 * The object branch declares the fields for the harness with permissive leaves.
 */
export const PatchConfigSchema: z<PatchConfig> = z.intersect([
	z.transform(z.any(), readPatchLayer),
	z.object({
		store: withoutEmptyDefault(z.object({ path: z.any(), idle: z.any() })),
		defaultProfile: z.any(),
		budget: budgetFields,
		compaction: compactionFields,
		nudge: nudgeFields,
		customPrompt: z.any(),
		customPromptAppend: z.any(),
	}),
]);
// #endregion FUNC_PatchConfigSchema

// #region FUNC_readPresetLayer
/**
 * @purpose Validate the raw preset value with the strict preset rule of the core.
 * @invariants A rejected preset value gives the empty layer, so one broken row blocks no session.
 * @param value - The raw `config` of the preset row.
 * @returns The preset layer. The key `profile` is optional.
 */
function readPresetLayer(value: unknown): PresetConfig {
	try {
		const layer = loadPresetConfig(value ?? {});
		debug("Preset layer accepted", {
			event: "schema",
			keys: Object.keys(layer),
		});
		return layer;
	} catch (error) {
		debug("Preset layer rejected; the empty layer applies", {
			event: "schema-reject",
			error: String(error),
		});
		return {};
	}
}
// #endregion FUNC_readPresetLayer

// #region FUNC_PresetConfigSchema
/**
 * @purpose Expose preset settings and give the preset one layer that no row value rejects.
 * The schema of the preset entry.
 *
 * The branches follow the rule of the bundle row. The `profile` field is optional: an absent
 * profile selects the default profile of the base layer. The preset declares no compaction field.
 */
export const PresetConfigSchema: z<PresetConfig> = z.intersect([
	z.transform(z.any(), readPresetLayer),
	z.object({
		profile: z.any(),
		budget: budgetFields,
		nudge: nudgeFields,
		customPrompt: z.any(),
		customPromptAppend: z.any(),
	}),
]);
// #endregion FUNC_PresetConfigSchema
