/**
 * #region moduleContract
 * @purpose Show the selected note with its provenance and its record actions, so a human reads one
 * record and changes it from the same panel.
 * @scope The inspector panel, the record actions, and the open of one record for an amendment.
 * NOT: the frontier list and the host calls.
 * @invariants The note body and its document must go into text nodes, never into markup.
 * @keywords inspector, note, provenance, action, delete, amend
 * #endregion moduleContract
 */

import type { OpenChildren, OpenEntry } from "../../core/src/domain/reads.js";
import type { Note } from "../../core/src/store/types.js";
import { openInTree } from "./actions.js";
import { btn, message } from "./controls.js";
import { noteDialog } from "./dialogs.js";
import { el, kv, panel } from "./dom.js";
import { address, kindName } from "./format.js";
import { action, request } from "./host.js";
import { state, tr } from "./state.js";
import type { RecordModel } from "./types.js";

// #region FUNC_inspector
/**
 * @purpose Show the selected note or range with its record actions.
 */
export function inspector(): HTMLElement {
	const node = panel(
		state.selection
			? `${tr("inspector")} · ${state.selection.target}`
			: tr("inspector"),
	);
	node.classList.add("ins");
	if (!state.selection) {
		node.append(el("p", tr("selectLine"), "muted"));
		return node;
	}
	const { result } = state.selection;
	if (result.kind !== "entry") {
		node.append(el("p", tr("noSummary"), "muted"));
		return node;
	}
	const record = state.model?.records.find((item) => item.id === result.id);
	const quote = el("div", "", "quote");
	quote.append(document.createTextNode(result.body));
	if (result.longform) quote.append(el("div", result.longform, "doc"));
	node.append(
		quote,
		kv(metaRows(result, record)),
		recordActions(result.addr, record),
		extraActions(result),
	);
	return node;
}
// #endregion FUNC_inspector

function metaRows(result: OpenEntry, record?: RecordModel): [string, string][] {
	return [
		[tr("id"), result.id],
		[tr("time"), result.ts],
		[tr("kind"), kindName(record?.kind ?? "unavailable")],
		[tr("session"), record?.session ?? tr("none")],
		[tr("preset"), record?.preset ?? tr("none")],
		[tr("refs"), result.refs.join(", ") || tr("none")],
		[tr("supersedes"), record?.supersedes.join(", ") || tr("none")],
		[tr("supersededBy"), record?.superseded_by ?? tr("none")],
		[tr("reviewAt"), result.review_at ?? tr("none")],
		[tr("modifiedAt"), result.modified_at ?? tr("none")],
	];
}

function extraActions(result: OpenEntry) {
	const extra = el("div", "", "actions");
	extra.append(
		btn(tr("copyId"), async () => {
			await navigator.clipboard.writeText(result.id);
			message(tr("copied"));
		}),
	);
	if (state.screen !== "tree")
		extra.append(btn(tr("openInTree"), () => openInTree(result.addr)));
	return extra;
}

// #region FUNC_recordActions
/**
 * @purpose Build the record actions of one note.
 * @invariants Delete waits for a confirmation and stays disabled without host permission.
 */
export function recordActions(target: string, record?: RecordModel | Note) {
	const row = el("div", "", "actions");
	row.append(
		btn(tr("actReviewed"), () => action("review", { target })),
		btn(tr("actAmend"), () => editTarget(target, false)),
		btn(tr("actSupersede"), () => editTarget(target, true)),
		btn(tr("actForget"), async () => {
			if (confirm(tr("confirmForget", { target })))
				await action("forget", { target });
		}),
	);
	const remove = btn(
		tr("actDelete"),
		async () => {
			if (confirm(tr("confirmDelete", { target })))
				await action("delete", { target, confirm: true });
		},
		"danger",
	);
	remove.disabled = !state.model?.allowDelete || record?.state === "deleted";
	row.append(remove);
	return row;
}
// #endregion FUNC_recordActions

// #region FUNC_editTarget
/**
 * @purpose Open the note dialog for one record, and read the record first when the view lacks it.
 */
async function editTarget(target: string, supersede: boolean) {
	const record = state.model?.records.find((item) => address(item) === target);
	if (record) {
		noteDialog(record, supersede ? target : "");
		return;
	}
	const result = await request<OpenEntry | OpenChildren>(
		`/api/open?${new URLSearchParams({ profile: state.profile, scope: state.scope, target })}`,
	);
	if (result.kind !== "entry") throw new Error(tr("selectLine"));
	noteDialog(result, supersede ? target : "");
}
// #endregion FUNC_editTarget
