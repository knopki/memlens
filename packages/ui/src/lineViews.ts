/**
 * #region moduleContract
 * @purpose Give the tree screen and the catalog screen one legend and one children panel. The two
 * screens name a line kind in the same way.
 * @scope The kind labels, the legend, and the children panel. NOT: the line row and the open calls.
 * @keywords legend, children, line, kind, panel
 * #endregion moduleContract
 */

import type { SliceLine } from "../../core/src/types/tree.js";
import { el, panel } from "./dom.js";
import type { Table } from "./i18n.js";
import { tr } from "./state.js";

const KIND_LABELS: Record<SliceLine["kind"], keyof Table> = {
	record: "record",
	summary: "clean",
	temporary: "pending",
};

// #region FUNC_legendOf
/**
 * @purpose Build the legend of a screen from the kinds that its lines can hold.
 * @invariants The legend names only the kinds that its screen holds.
 */
export function legendOf(kinds: readonly SliceLine["kind"][]) {
	const node = el("div", "", "legend");
	for (const kind of kinds)
		node.append(el("span", tr(KIND_LABELS[kind]), `lg ${kind[0]}`));
	return node;
}
// #endregion FUNC_legendOf

// #region FUNC_childrenPanel
/**
 * @purpose Build the panel of the children of one open range.
 * @invariants The panel states the count of its rows. An empty panel states that fact.
 */
export function childrenPanel(title: string, rows: readonly HTMLElement[]) {
	const node = panel(title, String(rows.length));
	const list = el("div", "", "lines");
	for (const row of rows) list.append(row);
	if (!rows.length) list.append(el("p", tr("none"), "muted"));
	node.append(list);
	return node;
}
// #endregion FUNC_childrenPanel
