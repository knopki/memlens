/**
 * #region moduleContract
 * @purpose Assemble the console page: read the stored language and theme, draw the chrome and the
 * current screen, and follow the page address.
 * @scope The page root, the draw step, the keyboard and history listeners, and the first restore.
 * NOT: the chrome, the screens, and the host calls.
 * @invariants The draw step is the only writer of the page body.
 * @keywords console, assembly, draw, listener, restore, address
 * #endregion moduleContract
 */

import { go, restore } from "./actions.js";
import { applyTheme, footer, header, layout } from "./chrome.js";
import { run } from "./controls.js";
import { el } from "./dom.js";
import { setDraw } from "./repaint.js";
import { readRoute, SCREENS } from "./route.js";
import { chosen, state, theme, tr, useLang } from "./state.js";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Console root is absent");

const shell = el("div", "", "shell");
app.append(shell);

useLang(chosen("memlens.lang", navigator.language));
state.theme = theme(chosen("memlens.theme", "system"));

// #region FUNC_render
/**
 * @purpose Keep the chrome and the current screen consistent with the latest model.
 */
function render(): void {
	const model = state.model;
	if (!model) return;
	document.documentElement.lang = state.lang;
	document.title = tr("title");
	const skip = document.querySelector<HTMLAnchorElement>(".skip");
	if (skip) skip.textContent = tr("skip");
	shell.replaceChildren(header(model), layout(model), footer(model));
}
// #endregion FUNC_render

setDraw(render);

document.addEventListener("keydown", (event) => {
	const next = SCREENS[Number(event.key) - 1];
	if (
		next !== undefined &&
		!document.querySelector("dialog[open]") &&
		!["INPUT", "TEXTAREA", "SELECT"].includes(
			document.activeElement?.tagName ?? "",
		)
	)
		go(next);
});

window.addEventListener("popstate", () => {
	void run(async () => {
		await restore(readRoute(location.search));
	});
});

window
	.matchMedia("(prefers-color-scheme: dark)")
	.addEventListener("change", () => {
		if (state.theme === "system") applyTheme();
	});

applyTheme();
void run(async () => {
	await restore(readRoute(location.search));
});
