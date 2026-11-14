/**
 * #region moduleContract
 * @purpose Build the native DOM elements of the console from typed helpers, so each screen writes
 * text and attributes without markup strings.
 * @scope The element, the control, the panel, the key-value block, the table, the meter, and the
 * icon. NOT: the state, the host calls, and the screen composition.
 * @invariants Each text goes into a text node, so no helper writes untrusted text as markup.
 * @dependencies USES: the message table and the closed sets of the route module.
 * @keywords dom, element, control, panel, table, icon
 * #endregion moduleContract
 */

import { KIND_KEYS, type Table } from "./i18n.js";
import { KINDS } from "./route.js";
import { tr } from "./state.js";

// #region FUNC_el
/**
 * @purpose Create one element with its text and its class.
 * @invariants The text goes into a text node.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	text = "",
	className = "",
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	node.textContent = text;
	node.className = className;
	return node;
}
// #endregion FUNC_el

export function input(value = "", type = "text") {
	const node = el("input");
	node.type = type;
	node.value = value;
	return node;
}

// #region FUNC_select
/**
 * @purpose Build a select with one option for each value.
 * @param values - The option values. An empty value takes the label.
 * @param value - The selected value.
 * @param label - The text of the empty option.
 */
export function select(
	values: readonly string[],
	value: string,
	label?: string,
) {
	const node = el("select");
	for (const item of values) {
		const option = el("option", label && !item ? label : item, "");
		option.value = item;
		node.append(option);
	}
	node.value = value;
	return node;
}
// #endregion FUNC_select

// #region FUNC_kindSelect
/**
 * @purpose Build the kind filter of a screen.
 * @invariants Show the translated name of each kind.
 */
export function kindSelect(value: string) {
	const node = select(["", ...KINDS], value, tr("allKinds"));
	for (const option of node.options)
		option.textContent = option.value
			? tr(KIND_KEYS[option.value as keyof typeof KIND_KEYS] as keyof Table)
			: tr("allKinds");
	return node;
}
// #endregion FUNC_kindSelect

export function filterBar(items: [string, HTMLElement][]) {
	const node = el("div", "", "filters");
	for (const [name, control] of items) {
		const wrap = el("label");
		wrap.append(el("span", name), control);
		node.append(wrap);
	}
	return node;
}

export function field(text: string, control: HTMLElement) {
	const wrap = el("div", "", "field");
	const label = el("label", text);
	label.append(control);
	wrap.append(label);
	return wrap;
}

export function pill(label: string, value: HTMLElement | string, warn = false) {
	const node = el("span", "", warn ? "pill warn" : "pill");
	node.append(
		el("span", label, "k"),
		typeof value === "string" ? el("b", value) : value,
	);
	return node;
}

export function panel(title: string, right = "") {
	const node = el("section", "", "panel");
	const head = el("div", "", "head");
	head.append(el("span", title, "t"));
	if (right) head.append(el("span", right, "r"));
	node.append(head);
	return node;
}

export function kv(rows: [string, string][]) {
	const node = el("div", "", "kv");
	for (const [key, value] of rows) node.append(el("b", key), el("span", value));
	return node;
}

// #region FUNC_tableOf
/**
 * @purpose Build a table with a header row and its body rows.
 * @invariants A cell that is not text becomes a child node. An empty body states that fact.
 */
export function tableOf(headers: string[], rows: (string | HTMLElement)[][]) {
	const wrap = el("div", "", "table-wrap");
	const node = el("table");
	const head = el("tr");
	for (const name of headers) head.append(el("th", name));
	const thead = el("thead");
	thead.append(head);
	node.append(thead);
	const body = el("tbody");
	for (const row of rows) {
		const line = el("tr");
		for (const cell of row) {
			const td = el("td");
			if (typeof cell === "string") td.textContent = cell;
			else td.append(cell);
			line.append(td);
		}
		body.append(line);
	}
	node.append(body);
	wrap.append(node);
	if (!rows.length) wrap.append(el("p", tr("none"), "muted"));
	return wrap;
}
// #endregion FUNC_tableOf

export function widthPercent(used: number, limit: number): number {
	return Math.min(100, (100 * used) / Math.max(1, limit));
}

export function meter(used: number, limit: number) {
	const node = el("div", "", "meter");
	const bar = el("i");
	bar.style.width = `${widthPercent(used, limit)}%`;
	node.append(bar);
	return node;
}

// #region FUNC_icon
/**
 * @purpose Build one navigation glyph.
 * @invariants The glyph is decorative, so it takes no accessible name.
 */
export function icon(path: string) {
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
	svg.setAttribute("viewBox", "0 0 16 16");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("aria-hidden", "true");
	const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
	shape.setAttribute("d", path);
	svg.append(shape);
	return svg;
}
// #endregion FUNC_icon
