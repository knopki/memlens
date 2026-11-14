/**
 * #region moduleContract
 * @purpose Show the frontier of the selected scope beside the inspector, so a human opens one line
 * and reads its record.
 * @scope The frontier list, the line rows, the legend, the children panel, and the inspector. NOT:
 * the host calls and the address.
 * @keywords tree, frontier, line, range, note, inspector
 * #endregion moduleContract
 */

import { dateSpan } from "../../../core/src/domain/date-span.js";
import type { OpenLine } from "../../../core/src/domain/reads.js";
import type { SliceLine } from "../../../core/src/types/tree.js";
import { openTarget } from "../actions.js";
import { btn } from "../controls.js";
import { el, panel } from "../dom.js";
import { lineAddress, lineText } from "../format.js";
import { inspector } from "../inspector.js";
import { childrenPanel, legendOf } from "../lineViews.js";
import { state, tr } from "../state.js";
import type { View } from "../types.js";

// #region FUNC_tree
/**
 * @purpose Show the frontier of the selected scope beside the inspector.
 * @invariants A range line opens its children, and a note line opens its record. A temporary line
 *   shows its period only.
 */
export function tree(main: HTMLElement, model: View): void {
	const heading = main.querySelector("h1");
	if (heading) heading.textContent = `${tr("nav1")} · ${state.scope}`;
	main.append(el("p", tr("treeText"), "sub"));
	const lines = model.frontier;
	const live = model.records.filter(
		(record) => record.scope === state.scope && record.state === "live",
	);
	const panelNode = panel(
		tr("frontier"),
		tr("frontierMeta", { ranges: lines.length, live: live.length }),
	);
	panelNode.append(legendOf(["record", "summary", "temporary"]));
	const list = el("div", "", "lines");
	for (const line of lines) list.append(frontierLine(state.scope, line));
	if (!lines.length) list.append(el("p", tr("noFrontier"), "muted"));
	panelNode.append(list);
	const children =
		state.selection?.result.kind === "children"
			? childrenPanel(
					`${tr("children")} · ${state.selection.target}`,
					state.selection.result.children.map((child) => childLine(child)),
				)
			: undefined;
	const column = el("div", "", "column");
	if (children) column.append(children);
	const split = el("div", "", "split");
	split.append(panelNode, inspector());
	main.append(split, column);
}
// #endregion FUNC_tree

function frontierLine(key: string, line: SliceLine) {
	const target = lineAddress(key, line);
	const text = lineText(line);
	const node = btn("", () => openTarget(target), `line ${line.kind[0] ?? ""}`);
	node.append(el("span", target, "id"));
	node.append(el("span", text || dateSpan(line.from, line.to), "tx"));
	if (line.kind === "temporary") node.classList.add("pending");
	if (state.selection?.target === target) node.classList.add("sel");
	node.title = text || tr("notBuilt");
	return node;
}

function childLine(child: OpenLine) {
	const node = btn("", () => openTarget(child.addr), "line");
	node.append(el("span", child.addr, "id"));
	node.append(
		el(
			"span",
			child.built ? child.text : dateSpan(child.ts_from, child.ts_to),
			"tx",
		),
	);
	if (!child.built) node.classList.add("pending");
	node.title = child.built ? child.text : tr("notBuilt");
	return node;
}
