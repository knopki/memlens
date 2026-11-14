/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the ULID generation and its timestamp limits.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import { ulid } from "../src/domain/ulid.js";

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("ulid", () => {
	it("generates a 26-character string", () => {
		expect(ulid(Date.now())).toHaveLength(26);
	});

	it("uses only Crockford base32 characters", () => {
		expect(ulid(Date.now())).toMatch(CROCKFORD);
	});

	it("sorts by time when generated at different times", () => {
		expect(ulid(1000) < ulid(2000)).toBe(true);
	});

	it("generates different ids at the same time", () => {
		const t = Date.now();
		expect(ulid(t)).not.toBe(ulid(t));
	});

	it("rejects negative timestamps", () => {
		expect(() => ulid(-1)).toThrow();
	});

	it("rejects non-finite timestamps", () => {
		expect(() => ulid(Number.NaN)).toThrow();
		expect(() => ulid(Number.POSITIVE_INFINITY)).toThrow();
	});
});
