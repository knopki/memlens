/**
 * Tests for time formatting and comparison.
 */
import { describe, expect, it } from "vitest";
import {
	addDaysAtTime,
	compareIso,
	dateSpan,
	nowIso,
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

describe("dateSpan", () => {
	it("writes the shared prefix once", () => {
		expect(
			dateSpan("2026-11-01T08:38:36.760Z", "2026-11-02T09:00:00.000Z"),
		).toBe("2026-11-01..02");
		expect(dateSpan("2026-11-28", "2026-12-03")).toBe("2026-11-28..12-03");
		expect(dateSpan("2026-12-30", "2027-01-02")).toBe("2026-12-30..2027-01-02");
		expect(dateSpan("2026-11-11", "2026-11-11")).toBe("2026-11-11");
	});
});
