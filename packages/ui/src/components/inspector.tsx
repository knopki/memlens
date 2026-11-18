/**
 * #region moduleContract
 * @purpose Show the selected note with its provenance and its record actions, so a human reads one
 *   record and changes it from the same panel.
 * @scope The inspector panel, the record actions, and the open of one record for an amendment.
 *   NOT: the frontier list, the host calls, and the styles.
 * @invariants The note body and its document go into text nodes, never into markup.
 * @invariants A page without a selection renders no inspector.
 * @invariants The component holds no style, no transport, and no address.
 * @keywords inspector, note, provenance, action, delete, amend, component
 * #endregion moduleContract
 */

import type { OpenEntry } from "@memlens/core";
import type { JSX } from "react";
import { useState } from "react";
import type { ConsoleApi } from "../model/console.js";
import { kindName } from "../model/format.js";
import type { RecordModel } from "../types.js";
import { Button, KeyValue, Panel } from "./primitives.js";

// #region COMPONENT_Inspector
/**
 * @purpose Show the selected note or range with its record actions.
 * @invariants An absent selection gives no markup, so the shell shows no empty panel.
 * @invariants A range answer shows the selected line text when the caller supplies it.
 */
export function Inspector({
	api,
	rangeText,
}: {
	api: ConsoleApi;
	rangeText?: string;
}): JSX.Element | null {
	const selection = api.state.selection;
	if (!selection) return null;
	const { target, result } = selection;
	const title = `${api.t("inspector")} · ${target}`;
	if (result.kind !== "entry")
		return (
			<Panel title={title} className="ins">
				{rangeText ? (
					<div className="quote">{rangeText}</div>
				) : (
					<p className="muted">{api.t("noSummary")}</p>
				)}
			</Panel>
		);
	const row = api.state.model?.records.find((item) => item.id === result.id);
	return (
		<Panel title={title} className="ins">
			<div className="quote">
				{result.body}
				{result.longform ? <div className="doc">{result.longform}</div> : null}
			</div>
			<KeyValue rows={metaRows(api, result, row)} />
			<RecordActions
				api={api}
				target={result.addr}
				disabled={!api.state.model?.allowDelete || row?.state === "deleted"}
			/>
			{extraActions(api, result.addr, result.id)}
		</Panel>
	);
}
// #endregion COMPONENT_Inspector

function metaRows(
	api: ConsoleApi,
	result: OpenEntry,
	row?: RecordModel,
): [string, string][] {
	const { t } = api;
	return [
		[t("id"), result.id],
		[t("time"), result.ts],
		[t("kind"), kindName(t, row?.kind ?? "unavailable")],
		[t("session"), row?.session ?? t("none")],
		[t("preset"), row?.preset ?? t("none")],
		[t("refs"), result.refs.join(", ") || t("none")],
		[t("supersedes"), row?.supersedes.join(", ") || t("none")],
		[t("supersededBy"), row?.superseded_by ?? t("none")],
		[t("reviewAt"), result.review_at ?? t("none")],
		[t("modifiedAt"), result.modified_at],
	];
}

// #region COMPONENT_RecordActions
/**
 * @purpose Give the five record actions of one note, so the inspector and the review list share
 *   one row.
 * @invariants Forget and delete ask for a confirmation in the row. No host dialog opens.
 * @invariants The delete button is the only button that the caller can disable.
 */
export interface RecordActionsProps {
	readonly api: ConsoleApi;
	readonly target: string;
	readonly disabled?: boolean;
}

export function RecordActions({
	api,
	target,
	disabled = false,
}: RecordActionsProps): JSX.Element {
	const { t } = api;
	const [asking, setAsking] = useState("");
	const run = (): void => {
		const forget = asking === "forget";
		setAsking("");
		void api.call.action(
			forget ? "forget" : "delete",
			forget ? { target } : { target, confirm: true },
		);
	};
	return (
		<div className="actions">
			<Button
				text={t("actReviewed")}
				onClick={() => {
					void api.call.action("review", { target });
				}}
			/>
			<Button
				text={t("actAmend")}
				onClick={() => {
					void api.call.editNote(target, false);
				}}
			/>
			<Button
				text={t("actSupersede")}
				onClick={() => {
					void api.call.editNote(target, true);
				}}
			/>
			<Button text={t("actForget")} onClick={() => setAsking("forget")} />
			<Button
				text={t("actDelete")}
				className="danger"
				disabled={disabled}
				onClick={() => setAsking("delete")}
			/>
			{asking ? (
				<>
					<Button
						text={t(asking === "forget" ? "confirmForget" : "confirmDelete", {
							target,
						})}
						onClick={run}
					/>
					<Button
						text={t("cancel")}
						className="ghost"
						onClick={() => setAsking("")}
					/>
				</>
			) : null}
		</div>
	);
}
// #endregion COMPONENT_RecordActions

function extraActions(
	api: ConsoleApi,
	target: string,
	id: string,
): JSX.Element {
	return (
		<div className="actions">
			<Button
				text={api.t("copyId")}
				onClick={() => {
					api.call.copy(id);
				}}
			/>
			{api.state.screen === "tree" ? null : (
				<Button
					text={api.t("openInTree")}
					onClick={() => {
						void api.call.openInTree(target);
					}}
				/>
			)}
		</div>
	);
}
