/**
 * #region moduleContract
 * @purpose Find notes by words in the selected scope or in every visible scope, and open one hit.
 * @scope The words, the three filters, the hit count, the hit rows, and the highlight. NOT: the
 * search call and the address.
 * @keywords search, find, hit, filter, highlight, scope
 * #endregion moduleContract
 */

import type { IndexHit } from "../../../core/src/store/types.js";
import type { NoteKind } from "../../../core/src/types/primitives.js";
import { openTarget } from "../actions.js";
import { btn, message, run } from "../controls.js";
import { el, filterBar, input, kindSelect, panel, select } from "../dom.js";
import { kindName } from "../format.js";
import { find } from "../host.js";
import { inspector } from "../inspector.js";
import { state, tr } from "../state.js";
import type { View } from "../types.js";

// #region FUNC_search
/**
 * @purpose Find notes by words in the selected scope or in every visible scope.
 * @invariants Show the hit count and keep the selection beside the results. The scope filter opens
 *   on the selected scope. A hit takes the frontier line row, and the open hit keeps its selected
 *   state.
 */
export function search(main: HTMLElement, model: View): void {
	main.append(el("p", tr("searchText"), "sub"));
	const controls = searchControls(model);
	main.append(controls.bar, controls.filters);
	const list = panel(
		tr("matches", { count: state.hits.length }),
		controls.scopeValue() || tr("allScopes"),
	);
	const rows = el("div", "", "lines");
	for (const hit of state.hits) rows.append(hitRow(hit));
	if (!state.hits.length) rows.append(el("p", tr("noMatches"), "muted"));
	list.append(rows);
	const split = el("div", "", "split");
	split.append(list, inspector());
	main.append(split);
}
// #endregion FUNC_search

// #region FUNC_searchControls
/**
 * @purpose Build the words, the controls, and the submit step of the search screen.
 */
function searchControls(model: View) {
	const words = input(state.query);
	words.spellcheck = false;
	words.placeholder = tr("searchText");
	const scopes = select(
		["", ...model.scopes.map((item) => item.key)],
		state.searchScope ?? model.scope,
		tr("allScopes"),
	);
	const kinds = kindSelect(state.kind);
	const date = input(state.since, "date");
	const cap = input(state.limit, "number");
	cap.min = "1";
	cap.max = "50";
	const submit = async () => {
		state.query = words.value.trim();
		state.kind = kinds.value as NoteKind | "";
		state.since = date.value;
		state.limit = cap.value;
		state.searchScope = scopes.value;
		if (!state.query) {
			message(tr("searchHint"));
			return;
		}
		await find("push");
	};
	const findBtn = btn(tr("find"), submit, "pri");
	const bar = el("div", "", "searchbar");
	bar.append(words, findBtn);
	words.addEventListener("keydown", (event) => {
		if (event.key === "Enter") run(submit);
	});
	const filters = filterBar([
		[tr("scope"), scopes],
		[tr("kindLabel"), kinds],
		[tr("since"), date],
		[tr("limit"), cap],
	]);
	return { bar, filters, scopeValue: () => scopes.value };
}
// #endregion FUNC_searchControls

function hitRow(hit: IndexHit) {
	const node = btn("", () => openTarget(hit.addr), "line hit");
	node.append(
		el("span", hit.addr, "id"),
		el("span", kindName(hit.kind), "kind"),
		highlight(hit.body),
		el("span", hit.ts.slice(0, 10), "when"),
	);
	if (state.selection?.target === hit.addr) node.classList.add("sel");
	return node;
}

function highlight(body: string) {
	const node = el("span", "", "tx");
	const tokens = state.query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
	const lower = body.toLocaleLowerCase();
	let offset = 0;
	while (offset < body.length) {
		const match = tokens
			.map((word) => ({ at: lower.indexOf(word, offset), word }))
			.filter((item) => item.at >= 0)
			.sort((a, b) => a.at - b.at)[0];
		if (!match) {
			node.append(document.createTextNode(body.slice(offset)));
			break;
		}
		node.append(
			document.createTextNode(body.slice(offset, match.at)),
			el("mark", body.slice(match.at, match.at + match.word.length)),
		);
		offset = match.at + match.word.length;
	}
	return node;
}
