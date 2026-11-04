import { describe, expect, it } from "vitest";

// The harness loads the built bundle, not the source. These tests fail when the
// bundle drops the plugin contract.
const bundle = (await import("../lib/index.js")) as {
	name?: string;
	apply?: unknown;
};

describe("plugin bundle", () => {
	it("exports the plugin identifier", () => {
		expect(bundle.name).toBe("dsh-memlens");
	});

	it("exports apply as a function", () => {
		expect(typeof bundle.apply).toBe("function");
	});
});
