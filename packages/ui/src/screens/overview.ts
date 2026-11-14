/**
 * #region moduleContract
 * @purpose Show each visible scope as one card and the assembled slice below it.
 * @scope The scope card, the counts, the first frontier lines, and the slice quote. NOT: the open
 * calls and the address.
 * @keywords overview, scope, card, slice, budget
 * #endregion moduleContract
 */

import { reset } from "../actions.js";
import { btn } from "../controls.js";
import { el, panel } from "../dom.js";
import { state, tr } from "../state.js";
import type { View } from "../types.js";

// #region FUNC_overview
/**
 * @purpose Show each visible scope as one card and the assembled slice below.
 * @invariants Keep a card for a scope with no live note. Quote the whole slice as text: the page
 *   scrolls, and the slice holds no height limit and no inner scroll.
 */
export function overview(main: HTMLElement, model: View): void {
	main.append(el("p", tr("ovText"), "sub"));
	const cards = el("div", "", "cards");
	for (const item of model.scopes) {
		const card = el(
			"section",
			"",
			item.key === state.scope ? "card active" : "card",
		);
		const head = el("div", "", "card-head");
		head.append(el("span", item.key, "key"));
		if (item.key === state.scope) head.append(el("span", tr("live"), "tag"));
		const stats = el("div", "", "stats");
		for (const [name, value] of [
			[tr("live"), item.live],
			[tr("hidden"), item.hidden],
			[tr("deleted"), item.deleted],
		] as const)
			stats.append(el("span", `${value} ${name}`, ""));
		const lines = item.frontier.split("\n").filter(Boolean);
		const mini = el("div", "", "mini");
		for (const text of lines.slice(0, 3)) mini.append(el("div", text, ""));
		if (!lines.length) mini.append(el("div", tr("noFrontier"), "muted"));
		card.append(
			head,
			stats,
			mini,
			btn(tr("openScope"), () => reset(item.key)),
		);
		cards.append(card);
	}
	main.append(cards);
	const slice = panel(
		tr("slice"),
		tr("lines", {
			used: model.budgets.here.used,
			limit: model.budgets.here.limit,
		}),
	);
	const text = el("pre", model.text, "slice");
	slice.append(text);
	main.append(slice);
}
// #endregion FUNC_overview
