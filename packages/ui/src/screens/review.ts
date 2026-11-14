/**
 * #region moduleContract
 * @purpose List the due notes and the next notes of the selected scope with their review dates and
 * the record actions.
 * @scope The kind filter, the two note tables, and the review periods. NOT: the review call and the
 * address.
 * @keywords review, due, next, period, kind, note
 * #endregion moduleContract
 */

import type { NoteKind } from "../../../core/src/types/primitives.js";
import { openInTree } from "../actions.js";
import { btn, run } from "../controls.js";
import { el, filterBar, kindSelect, kv, panel, tableOf } from "../dom.js";
import { kindName } from "../format.js";
import { reload } from "../host.js";
import { recordActions } from "../inspector.js";
import { state, tr } from "../state.js";
import type { View } from "../types.js";

// #region FUNC_review
/**
 * @purpose List the due notes of the selected scope and the next notes.
 * @invariants The kind filter keeps one kind in both lists. The next list states its shown count
 *   and the count before the cap.
 */
export function review(main: HTMLElement, model: View): void {
	main.append(el("p", tr("revText"), "sub"));
	const kinds = kindSelect(state.reviewKind);
	kinds.onchange = () =>
		run(async () => {
			state.reviewKind = kinds.value as NoteKind | "";
			await reload("push");
		});
	main.append(filterBar([[tr("kindLabel"), kinds]]));
	const headers = reviewHeaders();
	const list = panel(tr("due"), `${model.review.length}`);
	list.append(tableOf(headers, reviewRows(model.review)));
	const next = panel(
		tr("next"),
		`${model.reviewNext.length} / ${model.reviewNextTotal}`,
	);
	next.append(tableOf(headers, reviewRows(model.reviewNext)));
	const policy = panel(
		tr("reviewPeriods"),
		String(Object.keys(model.reviewPolicy).length),
	);
	policy.append(
		kv(
			Object.entries(model.reviewPolicy).map(([name, days]) => [
				kindName(name as NoteKind),
				tr("days", { count: days }),
			]),
		),
	);
	main.append(list, next, policy);
}
// #endregion FUNC_review

function reviewHeaders(): string[] {
	return [
		tr("address"),
		tr("text"),
		tr("kind"),
		tr("reviewDate"),
		tr("actions"),
	];
}

function reviewRows(items: View["review"]) {
	return items.map((item) => [
		btn(item.addr, () => openInTree(item.addr)),
		item.body,
		kindName(item.kind),
		item.review_at?.slice(0, 10) ?? tr("none"),
		recordActions(item.addr),
	]);
}
