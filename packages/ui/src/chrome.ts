/**
 * #region moduleContract
 * @purpose Draw the chrome of the console: the header, the rail, the screen body, and the footer.
 * @scope The profile, language, and theme pickers, the here budget, the navigation, the scope list,
 * the current screen, and the theme attribute. NOT: the screens and the host calls.
 * @invariants The theme choice must be light, dark, or system.
 * @keywords chrome, header, rail, navigation, scope, footer, theme
 * #endregion moduleContract
 */

import { go, reset } from "./actions.js";
import { btn, run } from "./controls.js";
import { noteDialog } from "./dialogs.js";
import { el, icon, meter, pill, select } from "./dom.js";
import { LANG_NAMES, LANGS, type Lang, type Table } from "./i18n.js";
import { repaint } from "./repaint.js";
import { SCREENS } from "./route.js";
import { SCREEN_VIEWS } from "./screens/index.js";
import { remember, state, theme, tr, useLang } from "./state.js";
import type { View } from "./types.js";

const ICONS = [
	"M2 3h12M2 8h12M2 13h7",
	"M8 14V9M8 9L4 6M8 9l4-3M4 6V3M12 6V3",
	"M2 12l3-5 3 2 3-6 3 3",
	"M10.2 10.2L14 14M6 3a4.2 4.2 0 100 8.4A4.2 4.2 0 006 3z",
	"M3 8l3 3 7-7",
	"M3 4h10M3 8h10M3 12h6",
	"M2 8h3l2-4 2 8 2-4h3",
];

// #region FUNC_header
/**
 * @purpose Show the profile, the language, the theme, the here budget, and the create action.
 */
export function header(model: View): HTMLElement {
	const node = el("header");
	const brand = el("div", "", "brand");
	brand.append(el("b", "memlens"));
	node.append(
		brand,
		pill(tr("profile"), profilePicker(model)),
		pill(tr("language"), langPicker()),
		pill(tr("theme"), themePicker()),
	);
	if (model.candidates.length)
		node.append(pill(tr("dirty"), String(model.candidates.length), true));
	node.append(
		el("span", "", "hspacer"),
		budget(model),
		btn(tr("newRecord"), noteDialog, "pri"),
	);
	return node;
}
// #endregion FUNC_header

function profilePicker(model: View) {
	const picker = select(model.profiles, state.profile);
	picker.id = "profile";
	picker.onchange = () =>
		run(async () => {
			state.profile = picker.value;
			await reset("");
		});
	return picker;
}

function langPicker() {
	const picker = select([...LANGS], state.lang, "");
	for (const option of picker.options)
		option.textContent = LANG_NAMES[option.value as Lang] ?? option.value;
	picker.id = "lang";
	picker.onchange = () => {
		useLang(picker.value);
		remember("memlens.lang", state.lang);
		repaint();
	};
	return picker;
}

function themePicker() {
	const picker = select(["system", "light", "dark"], state.theme, "");
	for (const option of picker.options)
		option.textContent = tr(
			`theme${option.value[0]?.toUpperCase()}${option.value.slice(1)}` as keyof Table,
		);
	picker.id = "theme";
	picker.onchange = () => {
		state.theme = theme(picker.value);
		remember("memlens.theme", state.theme);
		applyTheme();
	};
	return picker;
}

function budget(model: View) {
	const node = el("div", "", "budget");
	node.append(
		el(
			"span",
			tr("lines", {
				used: model.budgets.here.used,
				limit: model.budgets.here.limit,
			}),
		),
		meter(model.budgets.here.used, model.budgets.here.limit),
	);
	return node;
}

// #region FUNC_layout
/**
 * @purpose Build the rail, the screen heading, and the body of one screen.
 */
export function layout(model: View): HTMLElement {
	const rail = el("aside");
	const { nav, titles } = navigation();
	rail.append(
		el("div", tr("screens"), "rail-title"),
		nav,
		el("div", tr("scopes"), "rail-title"),
		scopeList(model),
	);
	const main = el("main");
	main.id = "main";
	main.tabIndex = -1;
	main.append(el("h1", titles[SCREENS.indexOf(state.screen)] ?? ""));
	SCREEN_VIEWS[state.screen](main, model);
	const body = el("div", "", "layout");
	body.append(rail, main);
	return body;
}
// #endregion FUNC_layout

function navigation() {
	const nav = el("nav");
	nav.setAttribute("aria-label", tr("screens"));
	const titles = SCREENS.map((_, index) => tr(`nav${index}` as keyof Table));
	for (const [index, screen] of SCREENS.entries()) {
		const item = btn(
			"",
			() => go(screen),
			state.screen === screen ? "nav on" : "nav",
		);
		if (state.screen === screen) item.setAttribute("aria-current", "page");
		item.append(icon(ICONS[index] ?? ""), el("span", titles[index] ?? ""));
		nav.append(item);
	}
	return { nav, titles };
}

function scopeList(model: View) {
	const node = el("div", "", "scopes");
	node.setAttribute("aria-label", tr("scopes"));
	for (const item of model.scopes)
		node.append(
			btn(
				item.key,
				() => reset(item.key),
				item.key === state.scope ? "sc on" : "sc",
			),
		);
	return node;
}

export function footer(model: View): HTMLElement {
	const node = el("footer");
	node.append(
		el("span", `${tr("store")}: ${model.path}`),
		el("span", `${tr("revision")}: ${model.revision.slice(0, 12)}`),
		el("span", `${tr("backend")}: ${model.backend}`),
	);
	return node;
}

// #region FUNC_applyTheme
/**
 * @purpose Put the chosen theme on the page and follow the system setting.
 * @invariants The attribute holds the resolved theme, so the stylesheet needs two palettes only. A
 * system change repaints the page without a reload.
 */
export function applyTheme(): void {
	const dark =
		state.theme === "dark" ||
		(state.theme === "system" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches);
	document.documentElement.dataset.theme = dark ? "dark" : "light";
	console.debug("Console theme", { event: "theme", choice: state.theme, dark });
}
// #endregion FUNC_applyTheme
