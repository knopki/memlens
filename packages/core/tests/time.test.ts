/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the ISO time format and the text comparison.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import {
	addDaysAtTime,
	compareIso,
	nowIso,
	parseNoteTime,
	toIso,
} from "../src/domain/time.js";

describe("nowIso", () => {
	it("returns a string ending with Z", () => {
		const result = nowIso();
		expect(result).toMatch(/Z$/);
	});

	it("returns a string in ISO 8601 format", () => {
		const result = nowIso();
		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
	});
});

describe("toIso", () => {
	it("converts a Date to ISO 8601", () => {
		const d = new Date("2026-11-10T17:44:58.000Z");
		expect(toIso(d)).toBe("2026-11-10T17:44:58.000Z");
	});

	it("converts a timestamp to ISO 8601", () => {
		const result = toIso(1794332698000);
		expect(result).toBe("2026-11-10T17:44:58.000Z");
	});
});

describe("addDaysAtTime", () => {
	it("adds days and keeps the time of day", () => {
		const d = new Date("2026-11-10T00:00:00.000Z");
		expect(addDaysAtTime(d, 7)).toBe("2026-11-17T00:00:00.000Z");
	});

	it("handles month boundaries", () => {
		const d = new Date("2026-11-28T00:00:00.000Z");
		expect(addDaysAtTime(d, 5)).toBe("2026-12-03T00:00:00.000Z");
	});
});

describe("compareIso", () => {
	it("returns negative when a < b", () => {
		expect(
			compareIso("2026-11-10T10:00:00.000Z", "2026-11-10T11:00:00.000Z"),
		).toBeLessThan(0);
	});

	it("returns zero when a = b", () => {
		expect(
			compareIso("2026-11-10T10:00:00.000Z", "2026-11-10T10:00:00.000Z"),
		).toBe(0);
	});

	it("returns positive when a > b", () => {
		expect(
			compareIso("2026-11-10T11:00:00.000Z", "2026-11-10T10:00:00.000Z"),
		).toBeGreaterThan(0);
	});
});

describe("parseNoteTime", () => {
	it("gives the stored form of a time with a zone", () => {
		expect(parseNoteTime("2025-05-03T00:00:00+03:00")).toBe(
			"2025-05-02T21:00:00.000Z",
		);
	});

	it("reads a day alone as the start of that day in the zone of the process", () => {
		expect(parseNoteTime("2025-05-03")).toBe(
			new Date(2025, 4, 3).toISOString(),
		);
	});

	it("gives null for a text that is not a time", () => {
		expect(parseNoteTime("yesterday")).toBeNull();
	});
});
