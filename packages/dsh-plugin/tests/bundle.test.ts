/**
 * #region moduleContract
 * @purpose Check that each built entry keeps the plugin contract that the harness loads.
 * @invariants The host bundle exports the name memlens, an apply function, and a Config.
 * @invariants The preset bundle exports a name, an apply function, and a Config.
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";

// The harness loads the built bundles, not the source. These tests fail when a
// bundle drops the plugin contract.
const host = (await import("../lib/index.js")) as {
	name?: string;
	apply?: unknown;
	Config?: unknown;
};

const preset = (await import("../lib/preset.js")) as {
	name?: string;
	apply?: unknown;
	Config?: unknown;
};

describe("host bundle", () => {
	it("exports the plugin identifier", () => {
		expect(host.name).toBe("memlens");
	});

	it("exports apply as a function", () => {
		expect(typeof host.apply).toBe("function");
	});

	it("exports the configuration schema", () => {
		expect(host.Config).toBeDefined();
	});
});

describe("preset bundle", () => {
	it("exports the preset identifier", () => {
		expect(preset.name).toBe("memlens/preset");
	});

	it("exports apply as a function", () => {
		expect(typeof preset.apply).toBe("function");
	});

	it("exports the preset configuration schema", () => {
		expect(preset.Config).toBeDefined();
	});
});
