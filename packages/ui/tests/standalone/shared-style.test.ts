/**
 * #region moduleContract
 * @purpose Hold the shared stylesheet to the surface scope, so no rule of a console reaches the
 * page of a host and no page rule reaches a console control.
 * @scope The selector scope, the colour values, and the page elements of the shared source.
 * @invariants Each test reads the shared source from the package, as the build reads it.
 * @dependencies READS: the shared stylesheet
 * @keywords test, style, css, scope, selector, colour, page element, shared
 * #endregion moduleContract
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The path of the shared stylesheet of the console. */
const SOURCE = new URL("../../src/console.css", import.meta.url);

// #region FUNC_source
/**
 * @purpose Give the rules of the shared stylesheet, without its contract comment.
 * @invariants A comment holds no rule, so no guard reads one.
 */
function source(): string {
	return readFileSync(SOURCE, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}
// #endregion FUNC_source

describe("shared stylesheet", () => {
	it("keeps every selector under the surface root", () => {
		const selectors = source()
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.endsWith("{") || line.endsWith(","))
			.filter((line) => !line.startsWith("@"));
		expect(selectors.length).toBeGreaterThan(40);
		for (const selector of selectors)
			expect(selector.startsWith(".ml-console")).toBe(true);
	});

	it("holds no literal colour", () => {
		const css = source();
		expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
		expect(css).not.toMatch(/\b(rgb|rgba|hsl|hsla)\(/i);
	});

	it("reaches no page element", () => {
		expect(source()).not.toMatch(/(^|[\s,{])(:root|html|body|\*)/m);
	});
});
