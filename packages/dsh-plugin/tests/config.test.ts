/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check that the harness schemas apply the strict core load rules.
 * @scope
 *  - The acceptance, the strict rejection, and the absent fields of the two schemas.
 *  - NOT: the merge, the store, and the host registration.
 * @invariants
 *  - An accepted layer equals the core layer, and an unknown key gives an error of the code `Data`.
 *  - An omitted field stays absent.
 * @keywords test, config, schema, patch, preset
 * #endregion moduleContract
 */

import { MemlensError } from "@memlens/core";
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
	compaction: { model: "deepseek-flash" },
	nudge: { tool_calls: 5 },
	customPrompt: "text",
	customPromptAppend: "append",
};

/** Run the schema and return its error. */
function errorOf(run: () => unknown): MemlensError {
	try {
		run();
	} catch (error) {
		expect(error).toBeInstanceOf(MemlensError);
		return error as MemlensError;
	}
	throw new Error("the schema accepted the value");
}

describe("PatchConfigSchema", () => {
	it("accepts the empty row", () => {
		expect(readPatch({})).toEqual({});
	});

	it("accepts the full row", () => {
		expect(readPatch(fullPatch)).toEqual(fullPatch);
	});

	it("accepts an absent row config", () => {
		expect(readPatch(undefined)).toBeUndefined();
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
	])("rejects an unknown key in %s", (_label, value) => {
		const error = errorOf(() => readPatch(value));
		expect(error.code).toBe("Data");
		expect(error.message).toContain("unknown key");
	});

	it.each([
		["the budget", { budget: { here: "ten" } }],
		["the store idle", { store: { idle: 0 } }],
		["the cache TTL", { cacheTtl: { "*": "soon" } }],
		["the profile", { defaultProfile: 4 }],
	])("rejects an invalid value of %s", (_label, value) => {
		const error = errorOf(() => readPatch(value));
		expect(error.code).toBe("Data");
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
	it("accepts a preset with the required profile", () => {
		expect(readPreset({ profile: "work" })).toEqual({
			profile: "work",
		});
	});

	it("accepts the full preset", () => {
		expect(readPreset(fullPreset)).toEqual(fullPreset);
	});

	it("rejects an absent preset config", () => {
		expect(() => readPreset(undefined)).toThrow();
	});

	it("keeps each omitted field absent", () => {
		const preset = readPreset({ profile: "work" }) as object;
		expect(Object.keys(preset)).toEqual(["profile"]);
	});

	it("rejects a preset without profile", () => {
		const error = errorOf(() => readPreset({}));
		expect(error.code).toBe("Data");
		expect(error.message).toContain("preset.profile");
	});

	it.each([
		["the preset", { profile: "work", writer: { provider: "deepseek" } }],
		[
			"the budget section",
			{ profile: "work", budget: { here: 10, slice: 20 } },
		],
		[
			"the compaction section",
			{
				profile: "work",
				compaction: { model: "m", provider: "p", retries: 1 },
			},
		],
		[
			"the nudge section",
			{ profile: "work", nudge: { turns: 2, mode: "tools" } },
		],
	])("rejects an unknown key in %s", (_label, value) => {
		const error = errorOf(() => readPreset(value));
		expect(error.code).toBe("Data");
		expect(error.message).toContain("unknown key");
	});

	it.each([
		["the profile", { profile: 4 }],
		["the budget", { profile: "work", budget: { here: "many" } }],
	])("rejects an invalid value of %s", (_label, value) => {
		const error = errorOf(() => readPreset(value));
		expect(error.code).toBe("Data");
	});

	it("shows the declared fields", () => {
		const text = String(PresetConfigSchema);
		for (const field of [
			"profile",
			"budget",
			"compaction",
			"nudge",
			"customPrompt",
			"customPromptAppend",
		]) {
			expect(text).toContain(field);
		}
	});
});
