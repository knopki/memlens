/**
 * #region moduleContract
 * @purpose Show each pending proposal with its session, scope, age, and decision.
 * @scope The proposal table and its two decisions. NOT: the proposal store rules and the address.
 * @keywords proposal, waiting, accept, dismiss, decision
 * #endregion moduleContract
 */

import type { Proposal } from "../../../core/src/store/types.js";
import { btn } from "../controls.js";
import { el, panel, tableOf } from "../dom.js";
import { action } from "../host.js";
import { tr } from "../state.js";
import type { View } from "../types.js";

// #region FUNC_proposals
/**
 * @purpose Show each pending proposal with its decision.
 */
export function proposals(main: HTMLElement, model: View): void {
	main.append(el("p", tr("propText"), "sub"));
	const list = panel(tr("waiting"), String(model.proposals.length));
	list.append(
		tableOf(
			[tr("id"), tr("session"), tr("text"), tr("scope"), tr("decision")],
			model.proposals.map((item) => [
				item.id,
				tr("none"),
				item.payload,
				item.scope,
				decisionCell(item),
			]),
		),
	);
	main.append(list);
}
// #endregion FUNC_proposals

function decisionCell(item: Proposal) {
	const row = el("div", "", "actions");
	row.append(
		btn(tr("accept"), () => action("accept", { target: item.id }), "pri"),
		btn(tr("dismiss"), () => action("dismiss", { target: item.id })),
	);
	return row;
}
