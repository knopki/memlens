/**
 * #region moduleContract
 * @purpose Check the plugin source contract: the identifier and the apply function.
 * @invariants The source exports the name memlens and an apply function.
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import { apply, name } from "../src/index.js";

describe("@memlens/dsh-plugin", () => {
	it("uses the plugin identifier memlens", () => {
		expect(name).toBe("memlens");
	});

	it("exports apply as a function", () => {
		expect(typeof apply).toBe("function");
	});
});
