/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check body overflow and document limits without silent content loss.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import {
	BODY_HARD_LIMIT,
	normalizeBody,
	splitBody,
} from "../src/domain/note-body.js";

describe("normalizeBody", () => {
	it("trims leading and trailing whitespace", () => {
		expect(normalizeBody("  hello world  ")).toBe("hello world");
	});

	it("collapses multiple spaces to one", () => {
		expect(normalizeBody("a  b")).toBe("a b");
	});

	it("collapses multiple tabs to one space", () => {
		expect(normalizeBody("a\tb")).toBe("a b");
	});

	it("passes a clean body through unchanged", () => {
		expect(normalizeBody("hello world")).toBe("hello world");
	});
});

describe("splitBody", () => {
	it("does not split a body within the limit", () => {
		const body = "a".repeat(BODY_HARD_LIMIT);
		const result = splitBody(body, null);
		expect(result.body).toBe(body);
		expect(result.longform).toBeNull();
	});

	it("moves overflow into longform, ending on a word boundary", () => {
		const prefix = "a ".repeat(255); // 510 chars, all within limit if no word breaks
		const body = `${prefix}extra overflow words`;
		const result = splitBody(body, null);
		expect(result.body.length).toBeLessThanOrEqual(BODY_HARD_LIMIT);
		// The body must end on a whole word
		expect(result.body).not.toMatch(/\s$/);
		expect(result.longform).toBeTruthy();
	});

	it("prepends overflow to existing longform", () => {
		const bodyChars = "word ".repeat(104); // > 512 chars
		const result = splitBody(bodyChars, "existing longform");
		expect(result.longform).toContain("existing longform");
	});

	it("accepts the longform limit and rejects overflow without silent content loss", () => {
		const longform = "x".repeat(16_384);
		expect(splitBody("body", longform).longform).toBe(longform);
		expect(() => splitBody("body", `${longform}x`)).toThrow(/16384/);
		expect(() => splitBody("x".repeat(513), longform)).toThrow(/16384/);
	});

	it("accepts exactly 512 characters", () => {
		const body = "a".repeat(BODY_HARD_LIMIT);
		const result = splitBody(body, null);
		expect(result.body).toHaveLength(BODY_HARD_LIMIT);
		expect(result.longform).toBeNull();
	});

	it("rejects 513 characters by moving overflow", () => {
		const body = `${"a ".repeat(256)}x`; // 513 chars
		const result = splitBody(body, null);
		expect(result.body.length).toBeLessThanOrEqual(BODY_HARD_LIMIT);
		expect(result.longform).toBeTruthy();
	});
});
