/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the render form of one address and the read of one range.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import {
	readRange,
	renderAddress,
	renderRange,
} from "../src/domain/address-form.js";

describe("renderAddress", () => {
	it("renders a pos with a leading #", () => {
		expect(renderAddress(null, 42, null)).toBe("#42");
	});

	it("renders a range with a leading #", () => {
		expect(renderAddress(null, 10, 20)).toBe("#10-20");
	});

	it("renders a scoped pos", () => {
		expect(renderAddress("project:dsh", 42, null)).toBe("project:dsh#42");
	});

	it("renders a scoped range", () => {
		expect(renderAddress("project:dsh", 10, 20)).toBe("project:dsh#10-20");
	});
});

describe("renderRange", () => {
	it("renders the start and the last position of the range", () => {
		expect(renderRange(null, { start: 8, level: 3 })).toBe("#8-15");
		expect(renderRange("project:dsh", { start: 0, level: 1 })).toBe(
			"project:dsh#0-1",
		);
	});
});

describe("readRange", () => {
	it("gives a store range back from its range id", () => {
		const ranges = [
			{ start: 0, level: 0 },
			{ start: 4, level: 0 },
			{ start: 0, level: 1 },
			{ start: 4, level: 2 },
			{ start: 8, level: 3 },
			{ start: 32, level: 5 },
		];
		for (const range of ranges)
			expect(readRange(renderRange(null, range))).toEqual(range);
	});

	it("rejects a width that is not a power of two", () => {
		expect(readRange("#5-7")).toBeNull();
		expect(readRange("#5")).toBeNull();
	});
});
