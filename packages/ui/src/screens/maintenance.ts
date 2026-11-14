/**
 * #region moduleContract
 * @purpose Show the build state, the line budgets, the merge candidates, and the compaction job of
 * one scope.
 * @scope The count tiles, the two budgets, the candidate table, the node levels, and the compaction
 * panel. NOT: the store rules and the address.
 * @keywords maintenance, budget, candidate, level, compaction, job
 * #endregion moduleContract
 */

import { el, panel, tableOf, widthPercent } from "../dom.js";
import { rangeAddress } from "../format.js";
import { tr } from "../state.js";
import type { View } from "../types.js";
import { compactionPanel } from "./compaction.js";

// #region FUNC_maintenance
/**
 * @purpose Show the build state, the budgets, and the compaction job.
 * @invariants Show no compaction state and no session snapshot state.
 */
export function maintenance(main: HTMLElement, model: View): void {
	main.append(el("p", tr("maintText"), "sub"));
	main.append(
		tiles(model),
		budgetPanel(model),
		candidatePanel(model),
		levelPanel(model),
		compactionPanel(),
	);
}
// #endregion FUNC_maintenance

function tiles(model: View) {
	const row = el("div", "", "tiles");
	for (const [value, name] of [
		[model.records.length, tr("records")],
		[model.nodes.length, tr("treeNodes")],
		[model.candidates.length, tr("mergeCandidates")],
	] as const) {
		const tile = el("div", "", "tile");
		tile.append(el("div", String(value), "n"), el("div", name, "l"));
		row.append(tile);
	}
	return row;
}

function budgetPanel(model: View) {
	const node = panel(tr("lineBudgets"));
	node.append(
		bar("here", model.budgets.here),
		bar("directions", model.budgets.directions),
	);
	return node;
}

function bar(name: string, value: { used: number; limit: number }) {
	const node = el("div", "", "bar");
	const track = el("div", "", "track");
	const fillNode = el("i");
	fillNode.style.width = `${widthPercent(value.used, value.limit)}%`;
	track.append(fillNode);
	node.append(
		el("span", name),
		track,
		el("span", tr("lines", { used: value.used, limit: value.limit })),
	);
	return node;
}

function candidatePanel(model: View) {
	const node = panel(tr("mergeCandidates"), String(model.candidates.length));
	node.append(
		tableOf(
			[tr("scope"), tr("range"), tr("level"), tr("state")],
			model.candidates.map((item) => [
				item.scope,
				rangeAddress(item.scope, item.range),
				String(item.range.level),
				item.ready ? tr("ready") : tr("waits"),
			]),
		),
	);
	return node;
}

function levelPanel(model: View) {
	const levels = [
		...new Set([
			...model.nodes.map((item) => item.node.level),
			...model.candidates.map((item) => item.range.level),
		]),
	].sort((a, b) => a - b);
	const node = panel(tr("nodesByLevel"));
	node.append(
		tableOf(
			[tr("level"), tr("nodes"), tr("dirty"), tr("candidates")],
			levels.map((level) => [
				String(level),
				String(model.nodes.filter((item) => item.node.level === level).length),
				String(
					model.nodes.filter((item) => item.node.level === level && !item.clean)
						.length,
				),
				String(
					model.candidates.filter((item) => item.range.level === level).length,
				),
			]),
		),
	);
	return node;
}
