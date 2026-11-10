/**
 * Tests for ULID generation.
 */
import { describe, expect, it } from "vitest";
import { isUlid, ulid } from "../src/domain/ulid.js";

describe("ulid", () => {
	it("generates a 26-character string", () => {
		const id = ulid(Date.now());
		expect(id).toHaveLength(26);
	});

	it("uses only Crockford base32 characters", () => {
		const id = ulid(Date.now());
		expect(isUlid(id)).toBe(true);
	});

	it("sorts by time when generated at different times", () => {
		const id1 = ulid(1000);
		const id2 = ulid(2000);
		expect(id1 < id2).toBe(true);
	});

	it("generates different ids at the same time", () => {
		const t = Date.now();
		const id1 = ulid(t);
		const id2 = ulid(t);
		expect(id1).not.toBe(id2);
	});

	it("rejects negative timestamps", () => {
		expect(() => ulid(-1)).toThrow();
	});

	it("rejects non-finite timestamps", () => {
		expect(() => ulid(Number.NaN)).toThrow();
		expect(() => ulid(Number.POSITIVE_INFINITY)).toThrow();
	});
});

describe("isUlid", () => {
	it("accepts a valid ULID", () => {
		const id = ulid(Date.now());
		expect(isUlid(id)).toBe(true);
	});

	it("rejects a string that is too short", () => {
		expect(isUlid("01234567890123456789012")).toBe(false);
	});

	it("rejects a string that is too long", () => {
		expect(isUlid("012345678901234567890123456")).toBe(false);
	});

	it("rejects a string with invalid characters", () => {
		expect(isUlid("0123456789012345678901234a")).toBe(false); // lowercase
		expect(isUlid("0123456789012345678901234I")).toBe(false); // I not in alphabet
		expect(isUlid("0123456789012345678901234L")).toBe(false); // L not in alphabet
		expect(isUlid("0123456789012345678901234U")).toBe(false); // U not in alphabet
	});
});
