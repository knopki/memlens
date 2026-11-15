/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check that the harness schemas accept each row state and drop each broken layer.
 * @scope
 *  - The acceptance, the absent fields, and the tolerated rejection of the two schemas.
 *  - NOT: the merge, the store, and the host registration.
 * @invariants
 *  - An accepted layer equals the core layer of the same value.
 *  - An omitted field stays absent.
 *  - A rejected value gives the empty layer, so no row value blocks a session.
 * @keywords test, config, schema, patch, preset, tolerance
 * #endregion moduleContract
 */

import { loadPresetConfig } from "@memlens/core";
import { describe, expect, it } from "vitest";
import { PatchConfigSchema, PresetConfigSchema } from "../src/config.js";

// The tests give the schemas invalid values on purpose, so the call accepts an unknown value.
const readPatch = PatchConfigSchema as unknown as (value?: unknown) => unknown;

const readPreset = PresetConfigSchema as unknown as (
	value?: unknown,
) => unknown;

const fullPatch = {
	store: { path: "~/.local/share/memlens", idle: 120 },
	defaultProfile: "work",
	budget: { here: 40, directions: 20 },
	compaction: {
		provider: "deepseek",
		model: "deepseek-chat",
		effort: "high",
		mode: "batch",
		batch: 4,
		maxCallsPerHour: 60,
	},
	nudge: {
		tool_calls: 5,
		turns: 7,
		text: { tool_calls: "A {n}", turns: "B {n}" },
	},
	cacheTtl: { "deepseek/*": "2h", "*": "30m" },
	customPrompt: "text",
	customPromptAppend: "append",
};

const fullPreset = {
	profile: "work",
	budget: { directions: 20 },
	nudge: { tool_calls: 5 },
	customPrompt: "text",
	customPromptAppend: "append",
};

describe("PatchConfigSchema", () => {
	it("accepts the empty row", () => {
		expect(readPatch({})).toEqual({});
	});

	it("accepts the full row", () => {
		expect(readPatch(fullPatch)).toEqual(fullPatch);
	});

	it("keeps each omitted field absent", () => {
		expect(readPatch({ store: { path: "~/.local/share/memlens" } })).toEqual({
			store: { path: "~/.local/share/memlens" },
		});
		expect(readPatch({ nudge: { turns: 7 } })).toEqual({
			nudge: { turns: 7 },
		});
	});

	it.each([
		["the row", { writer: { provider: "deepseek" } }],
		["the store section", { store: { path: "x", journal: "y" } }],
		["the budget section", { budget: { here: 10, slice: 20 } }],
		[
			"the compaction section",
			{ compaction: { model: "m", provider: "p", extra: 1 } },
		],
		[
			"the nudge text",
			{ nudge: { text: { tool_calls: "A {n}", turns: "B {n}", more: 1 } } },
		],
		["the budget value", { budget: { here: "ten" } }],
		["the store idle", { store: { idle: 0 } }],
		["the cache TTL", { cacheTtl: { "*": "soon" } }],
		["the profile", { defaultProfile: 4 }],
	])("states no error after an invalid value of %s", (_label, value) => {
		expect(() => readPatch(value)).not.toThrow();
	});

	it("shows the declared fields", () => {
		const text = String(PatchConfigSchema);
		for (const field of [
			"store",
			"defaultProfile",
			"budget",
			"compaction",
			"nudge",
			"cacheTtl",
			"customPrompt",
			"customPromptAppend",
		]) {
			expect(text).toContain(field);
		}
	});
});

describe("PresetConfigSchema", () => {
	it("accepts a preset with a profile", () => {
		expect(readPreset({ profile: "work" })).toEqual({
			profile: "work",
		});
	});

	it("accepts the full preset", () => {
		expect(readPreset(fullPreset)).toEqual(fullPreset);
	});

	it("accepts a preset without profile", () => {
		expect(readPreset({})).toEqual({});
	});

	it("keeps each omitted field absent", () => {
		const preset = readPreset({ profile: "work" }) as object;
		expect(Object.keys(preset)).toEqual(["profile"]);
	});

	it("tolerates a preset that still holds the removed compaction key", () => {
		expect(() =>
			readPreset({ profile: "work", compaction: { model: "deepseek-flash" } }),
		).not.toThrow();
	});

	it("leaves the removed compaction key to the strict preset rule", () => {
		const layer = readPreset({
			profile: "work",
			compaction: { model: "deepseek-flash" },
		});
		expect(() => loadPresetConfig(layer)).toThrow(/unknown key compaction/);
	});

	it.each([
		["the preset", { profile: "work", writer: { provider: "deepseek" } }],
		[
			"the budget section",
			{ profile: "work", budget: { here: 10, slice: 20 } },
		],
		[
			"the removed compaction key",
			{
				profile: "work",
				compaction: { model: "m", provider: "p", retries: 1 },
			},
		],
		[
			"the nudge section",
			{ profile: "work", nudge: { turns: 2, mode: "tools" } },
		],
		["the profile", { profile: 4 }],
		["the budget value", { profile: "work", budget: { here: "many" } }],
	])("states no error after an invalid value of %s", (_label, value) => {
		expect(() => readPreset(value)).not.toThrow();
	});

	it("shows the declared fields", () => {
		const text = String(PresetConfigSchema);
		for (const field of [
			"profile",
			"budget",
			"nudge",
			"customPrompt",
			"customPromptAppend",
		]) {
			expect(text).toContain(field);
		}
		expect(text).not.toContain("compaction");
	});
});
