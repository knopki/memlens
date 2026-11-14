/**
 * #region moduleContract
 * @purpose Create, amend, or supersede a record with explicit user input.
 * @scope The record dialog, its fields, and its save step. NOT: the store rules and the host call.
 * @dependencies POST action from the CLI host.
 * @keywords dialog, note, create, amend, supersede, scope
 * #endregion moduleContract
 */

import type { OpenEntry } from "../../core/src/domain/reads.js";
import { btn, run } from "./controls.js";
import { el, field, input, select } from "./dom.js";
import { action } from "./host.js";
import { KIND_KEYS } from "./i18n.js";
import { KINDS } from "./route.js";
import { state, tr } from "./state.js";
import type { RecordModel } from "./types.js";

type NoteFields = {
	parts: HTMLElement[];
	note: HTMLTextAreaElement;
	longform: HTMLTextAreaElement;
	scopeInput: HTMLInputElement;
	kindInput: HTMLSelectElement;
	replace: HTMLInputElement;
};

// #region FUNC_noteDialog
/**
 * @purpose Open the record dialog on the current profile and scope.
 * @invariants A new note starts with the selected scope. A save closes the dialog and refreshes the
 * view. An amendment opens each field with the value of the record, and the user changes any of
 * them.
 */
export function noteDialog(
	record?: RecordModel | OpenEntry,
	supersedes = "",
): void {
	const dialog = el("dialog");
	const form = el("form");
	const amend = record !== undefined && !supersedes;
	const fields = noteFields(record, amend, supersedes);
	const head = el("div", "", "head");
	head.append(el("span", amend ? tr("amendTitle") : tr("newTitle"), "t"));
	dialog.append(head);
	form.append(...fields.parts);
	const save = btn(amend ? tr("save") : tr("create"), () => {}, "pri");
	save.type = "submit";
	const foot = el("div", "", "dlg-foot");
	foot.append(
		btn(tr("cancel"), () => dialog.close(), "ghost"),
		save,
	);
	form.append(foot);
	form.onsubmit = (event) => {
		event.preventDefault();
		run(async () => {
			save.disabled = true;
			try {
				await saveNote(fields, amend, record);
				dialog.close();
			} finally {
				save.disabled = false;
			}
		});
	};
	dialog.append(form);
	dialog.addEventListener("close", () => dialog.remove());
	document.body.append(dialog);
	dialog.showModal();
	fields.note.focus();
}
// #endregion FUNC_noteDialog

function noteFields(
	record: RecordModel | OpenEntry | undefined,
	amend: boolean,
	supersedes: string,
): NoteFields {
	const note = el("textarea");
	note.value = record?.body ?? "";
	note.required = true;
	note.rows = 3;
	note.spellcheck = false;
	const counter = el("div", "", "counter");
	const update = () => {
		counter.textContent = tr("characters", { count: note.value.length });
	};
	note.oninput = update;
	update();
	const longform = el("textarea");
	longform.value = record?.longform ?? "";
	longform.rows = 5;
	longform.spellcheck = false;
	const scopeInput = input(record?.scope ?? state.scope);
	scopeInput.required = true;
	scopeInput.pattern = "[^:]+:[^:]+";
	scopeInput.placeholder = "project:example";
	const kindInput = select(
		[...KINDS],
		record && "kind" in record ? record.kind : "note",
	);
	for (const option of kindInput.options)
		option.textContent = tr(KIND_KEYS[option.value as keyof typeof KIND_KEYS]);
	const replace = input(supersedes);
	replace.spellcheck = false;
	const scopeField = field(tr("scopeField"), scopeInput);
	if (!amend) scopeField.append(el("div", tr("newScopeHint"), "hint"));
	const row = el("div", "", "row2");
	row.append(scopeField, field(tr("kindField"), kindInput));
	const parts = [
		field(tr("body"), note),
		counter,
		field(tr("longform"), longform),
		row,
		field(tr("supersedesField"), replace),
		el("div", "", "dlg-note"),
	];
	return { parts, note, longform, scopeInput, kindInput, replace };
}

// #region FUNC_saveNote
/**
 * @purpose Send one note or amendment to the host.
 * @invariants An amendment names the record and the destination scope. A new note names the scope of
 * the form.
 */
async function saveNote(
	fields: NoteFields,
	amend: boolean,
	record?: RecordModel | OpenEntry,
): Promise<void> {
	const payload: Record<string, unknown> = {
		body: fields.note.value,
		longform: fields.longform.value,
		kind: fields.kindInput.value,
		supersedes: fields.replace.value,
	};
	if (amend && record) {
		payload.target = `${record.scope}#${record.pos}`;
		payload.dest = fields.scopeInput.value;
	} else {
		payload.scope = fields.scopeInput.value;
	}
	await action(amend ? "amend" : "note", payload);
}
// #endregion FUNC_saveNote
