/**
 * #region moduleContract
 * @purpose Check the base read when the environment holds no home directory.
 * @scope The absent home directory, the error text of the read, and the store path of the layer.
 * @invariants The read never throws, and its store path stays empty.
 * #endregion moduleContract
 */

import { describe, expect, it, vi } from "vitest";

const THROWN = "no home directory";

vi.mock("node:os", () => ({
	homedir: () => {
		throw new Error(THROWN);
	},
}));

import { readPluginBase } from "../src/runtime.js";

describe("the base read with no home directory", () => {
	it("gives the default layer, the error, and no store path", () => {
		const read = readPluginBase({});
		expect(read.present).toBe(false);
		expect(read.error).toContain(THROWN);
		expect(read.base.store.path).toBe("");
	});
});
