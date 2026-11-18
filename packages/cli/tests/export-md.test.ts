/**
 * The scope filename encoding tests.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Check the scope filename encoding and its length limit, so the export writes one
 * readable and distinct file on each file system.
 * @keywords test, export, filename, encode, limit, hash
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import { encodeScopeFilename } from "../src/export-md.js";

describe("encodeScopeFilename", () => {
	it("keeps the plain characters and encodes the rest", () => {
		expect(encodeScopeFilename("project:a/b")).toBe("project%3Aa%2Fb.md");
	});

	it("encodes each UTF-8 byte of a name in another script", () => {
		expect(encodeScopeFilename("project:котя")).toBe(
			"project%3A%D0%BA%D0%BE%D1%82%D1%8F.md",
		);
	});

	it("keeps a stem within the byte limit unchanged", () => {
		const scope = `k:${"a".repeat(245)}`;
		expect(encodeScopeFilename(scope)).toBe(`k%3A${"a".repeat(245)}.md`);
	});

	it("cuts a long stem to its head and one hash", () => {
		const scope = `k:${"a".repeat(300)}`;
		expect(encodeScopeFilename(scope)).toMatch(/^k%3Aa{236}~[0-9a-f]{8}\.md$/);
		expect(encodeScopeFilename(scope).length).toBe(252);
	});

	it("gives two long scopes distinct files", () => {
		const first = encodeScopeFilename(`k:${"a".repeat(300)}`);
		const second = encodeScopeFilename(`k:${"a".repeat(299)}b`);
		expect(first).not.toBe(second);
	});

	it("leaves no broken percent tail after the cut", () => {
		const name = encodeScopeFilename(`k:${"а".repeat(120)}`);
		const head = name.slice(0, name.indexOf("~"));
		expect(name).toMatch(/~[0-9a-f]{8}\.md$/);
		expect(head).toMatch(/(%[0-9A-F]{2}|[^%])$/);
	});
});
