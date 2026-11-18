/**
 * #region moduleContract
 * @purpose Hold the theme adapter to the resolved theme attribute, so the page shows the palette of
 * the choice and follows the system setting while the choice is system.
 * @scope The three choices and the attribute of the document root.
 * @invariants Each test supplies one system setting.
 * @keywords test, theme, dark, light, system, attribute
 * #endregion moduleContract
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTheme } from "../../src/standalone/theme.js";

/** The attribute of the document root, as the adapter writes it. */
const root = { dataset: {} as Record<string, string> };

afterEach(() => {
	vi.unstubAllGlobals();
	root.dataset = {};
});

// #region FUNC_stubPage
/**
 * @purpose Give the adapter one document root and one system color scheme.
 * @param dark - The value of the system color scheme.
 */
function stubPage(dark: boolean): void {
	vi.stubGlobal("document", { documentElement: root });
	vi.stubGlobal("window", { matchMedia: () => ({ matches: dark }) });
}
// #endregion FUNC_stubPage

describe("theme adapter", () => {
	it("puts an explicit choice on the page", () => {
		stubPage(false);

		applyTheme("dark");
		expect(root.dataset.theme).toBe("dark");

		applyTheme("light");
		expect(root.dataset.theme).toBe("light");
	});

	it("follows the system setting while the choice is system", () => {
		stubPage(true);
		applyTheme("system");
		expect(root.dataset.theme).toBe("dark");

		stubPage(false);
		applyTheme("system");
		expect(root.dataset.theme).toBe("light");
	});
});
