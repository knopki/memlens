/**
 * #region moduleContract
 * @purpose Put the chosen theme on the standalone page, so the stylesheet selects one palette and
 * the page follows the system setting while the choice is system.
 * @scope The theme attribute of the document root and the system setting listener. NOT: the theme
 * choice rules, the storage, and the markup.
 * @invariants The attribute holds the resolved theme, light or dark.
 * @invariants A system change calls the theme step again without a page reload.
 * @dependencies READS: the system color scheme; WRITES: the attribute `data-theme`
 * @keywords theme, dark, light, system, matchmedia, attribute
 * #endregion moduleContract
 */

import type { Choice } from "../types.js";

// #region FUNC_applyTheme
/**
 * @purpose Put one theme choice on the page and resolve the system setting.
 * @invariants The attribute holds the resolved theme, so the stylesheet needs two palettes only.
 * @param choice - The theme choice of the page.
 */
export function applyTheme(choice: Choice): void {
	const dark =
		choice === "dark" ||
		(choice === "system" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.dataset.theme = dark ? "dark" : "light";
	console.debug("Console theme", { event: "theme", choice, dark });
}
// #endregion FUNC_applyTheme

// #region FUNC_watchSystemTheme
/**
 * @purpose Call one step for each change of the system color scheme.
 * @invariants The returned function removes the listener.
 */
export function watchSystemTheme(onChange: () => void): () => void {
	const media = window.matchMedia("(prefers-color-scheme: dark)");
	media.addEventListener("change", onChange);
	return () => {
		media.removeEventListener("change", onChange);
	};
}
// #endregion FUNC_watchSystemTheme
