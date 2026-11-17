/**
 * #region moduleContract
 * @purpose Give both console hosts one React record form, so a human creates, amends, or supersedes
 * a note from the shared component layer.
 * @scope The five form values, the character count, the two footer actions, and the save call.
 * NOT: the transport, the address, the store rules, and the stylesheet.
 * @invariants The form renders nothing while the API holds no open dialog.
 * @invariants A field text goes into a control value or into a text node, never into markup.
 * @invariants The form holds the drafts only. The open dialog, the status text, and the save come
 * from the API.
 * @invariants The body field shows a body of the declared size without a scroll, and it grows with
 * the text. The amendment form shows the supersede links of the record as text, and its field
 * takes the added addresses only.
 * @dependencies USES: the dialog, field, input, text area, select, and button primitives. USES: the
 * kind list and the message keys.
 * @keywords dialog, note, create, amend, supersede, scope, kind, characters, react
 * #endregion moduleContract
 */

import type { NoteKind } from "@memlens/core";
import type { JSX } from "react";
import { useState } from "react";
import type {
	ConsoleApi,
	DialogPayload,
	DialogState,
} from "../model/console.js";
import { kindName } from "../model/format.js";
import { KINDS } from "../route.js";
import {
	Button,
	Dialog,
	Field,
	Select,
	TextArea,
	TextInput,
} from "./primitives.js";
import type { ScreenProps } from "./screen-props.js";

// #region COMPONENT_NoteDialog
/**
 * @purpose Draw the open record dialog of the console.
 * @invariants The API holds the open dialog. The form renders nothing without it.
 */
export function NoteDialog({ api }: ScreenProps): JSX.Element | null {
	const dialog = api.state.dialog;
	if (!dialog) return null;
	return <NoteForm api={api} dialog={dialog} />;
}
// #endregion COMPONENT_NoteDialog

// #region COMPONENT_NoteForm
/**
 * @purpose Hold the drafts of one open record dialog.
 * @invariants The form takes its first values from the open dialog. A new dialog mounts a new form,
 * so a closed form leaves no draft behind.
 * @invariants The amend mode changes one record. The create mode and the supersede mode write a new
 * record, so both show the scope hint.
 */
interface NoteFormProps {
	readonly api: ConsoleApi;
	readonly dialog: DialogState;
}

function NoteForm({ api, dialog }: NoteFormProps): JSX.Element {
	const t = api.t;
	const amend = dialog.mode === "amend";
	const [draft, setDraft] = useState<DialogPayload>({
		body: dialog.body,
		longform: dialog.longform,
		scope: dialog.scope,
		kind: dialog.kind,
		supersedes: dialog.supersedes,
	});
	const patch = (fields: Partial<DialogPayload>): void =>
		setDraft((current) => ({ ...current, ...fields }));
	const close = (): void => api.call.closeDialog();
	return (
		<Dialog
			open={true}
			title={t(amend ? "amendTitle" : "newTitle")}
			note={api.state.status.text}
			noteError={api.state.status.error}
			onClose={close}
			onSubmit={() => void api.call.saveDialog(draft)}
			footer={
				<>
					<Button text={t("cancel")} className="ghost" onClick={close} />
					<Button
						text={t(amend ? "save" : "create")}
						className="pri"
						type="submit"
						disabled={api.state.busy}
					/>
				</>
			}
		>
			<Field label={t("body")}>
				<TextArea
					value={draft.body}
					onChange={(body) => patch({ body })}
					rows={6}
					spellCheck={false}
					required={true}
				/>
			</Field>
			<div className="counter">
				{t("characters", { count: draft.body.length })}
			</div>
			<Field label={t("longform")}>
				<TextArea
					value={draft.longform}
					onChange={(longform) => patch({ longform })}
					rows={5}
					spellCheck={false}
				/>
			</Field>
			<div className="row2">
				<Field label={t("scopeField")} hint={amend ? "" : t("newScopeHint")}>
					<TextInput
						value={draft.scope}
						onChange={(scope) => patch({ scope })}
						required={true}
						pattern="[^:]+:[^:]+"
						placeholder="project:example"
					/>
				</Field>
				<Field label={t("kindField")}>
					<Select
						value={draft.kind}
						options={KINDS.map((kind) => ({
							value: kind,
							label: kindName(t, kind),
						}))}
						onChange={(kind) => patch({ kind: kind as NoteKind })}
					/>
				</Field>
			</div>
			{amend && dialog.links.length ? (
				<Field label={t("supersedesLinks")}>
					<div className="links">
						{dialog.links.map((link) => (
							<span key={link} className="tag">
								{link}
							</span>
						))}
					</div>
				</Field>
			) : null}
			<Field label={amend ? t("addSupersedes") : t("supersedesField")}>
				<TextInput
					value={draft.supersedes}
					onChange={(supersedes) => patch({ supersedes })}
					spellCheck={false}
				/>
			</Field>
		</Dialog>
	);
}
// #endregion COMPONENT_NoteForm
