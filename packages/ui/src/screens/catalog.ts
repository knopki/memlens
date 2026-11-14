/**
 * #region moduleContract
 * @purpose Show the direction lines of the visible scopes with their budget, and open one part of
 * the catalog.
 * @scope The catalog list, the legend, the detail panel, and the range rows. NOT: the open calls
 * and the address.
 * @keywords catalog, direction, range, scope, budget, children
 * #endregion moduleContract
 */

import { dateSpan } from "../../../core/src/domain/date-span.js";
import type { Range, SliceLine } from "../../../core/src/types/tree.js";
import { openCatalog, openScopeTree } from "../actions.js";
import { btn } from "../controls.js";
import { el, panel } from "../dom.js";
import { lineText, rangeId, rangeOf } from "../format.js";
import { childrenPanel, legendOf } from "../lineViews.js";
import { state, tr } from "../state.js";
import type { View } from "../types.js";

// #region FUNC_catalog
/**
 * @purpose Show the direction lines of the visible scopes with their budget.
 * @invariants The list holds one line for each catalog range of the model. A range line opens its
 *   two halves in the panel beside the list. A line over one scope opens the tree of that scope. The
 *   list takes the legend of the two kinds that a catalog line can hold.
 */
export function catalog(main: HTMLElement, model: View): void {
	main.append(el("p", tr("catText"), "sub"));
	const lines = panel(
		tr("catLines"),
		tr("lines", {
			used: model.budgets.directions.used,
			limit: model.budgets.directions.limit,
		}),
	);
	lines.append(legendOf(["summary", "temporary"]));
	const list = el("div", "", "lines");
	for (const line of model.catalog) list.append(catalogLine(model, line));
	if (!model.catalog.length) list.append(el("p", tr("emptyCatalog"), "muted"));
	lines.append(list);
	const selected = state.selection;
	const detail =
		selected?.result.kind === "catalog"
			? childrenPanel(
					`${tr("children")} · ${catalogName(model, rangeOf(selected.target))}`,
					selected.result.children.map((line) => catalogLine(model, line)),
				)
			: hintPanel();
	const split = el("div", "", "split keys");
	split.append(lines, detail);
	main.append(split);
}
// #endregion FUNC_catalog

/** The panel of the catalog screen with no open line. */
function hintPanel() {
	const node = panel(tr("children"));
	node.append(el("p", tr("selectLine"), "muted"));
	return node;
}

/** The name of one catalog range for a human: the scope keys it covers, or its range id. */
function catalogName(model: View, range: Range): string {
	const covered = model.catalogScopes.slice(
		range.start,
		range.start + 2 ** range.level,
	);
	return covered.join(",") || rangeId(range);
}

function catalogLine(model: View, line: SliceLine) {
	const range =
		line.kind === "record" ? { start: line.pos, level: 0 } : line.range;
	const scope =
		range.level === 0 ? model.catalogScopes[range.start] : undefined;
	const target = rangeId(range);
	const node = btn(
		"",
		() => (scope ? openScopeTree(scope) : openCatalog(range)),
		`line ${line.kind[0] ?? ""}`,
	);
	node.append(el("span", catalogName(model, range), "id"));
	const text = lineText(line);
	node.append(el("span", text || dateSpan(line.from, line.to), "tx"));
	if (line.kind === "temporary") node.classList.add("pending");
	if (state.selection?.target === target) node.classList.add("sel");
	node.title = text || tr("notBuilt");
	return node;
}
