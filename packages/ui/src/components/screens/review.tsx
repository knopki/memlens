/**
 * #region moduleContract
 * @purpose List the due notes and the next notes of the selected scope with their review dates and
 * their record actions, so a human reviews the notes of one scope.
 * @scope The kind filter, the two note tables, and the review periods. NOT: the reload call, the
 * transport, and the address.
 * @invariants The kind filter keeps one kind in both lists. Each list states its shown count and
 * the count before the cap. The periods panel shows only when the read holds the policy.
 * @invariants A note body goes into a text node.
 * @keywords review, due, next, period, kind, note, actions, react
 * #endregion moduleContract
 */

import type { DueRecord, NoteKind } from "@memlens/core";
import { dayOf, NOTE_KINDS } from "@memlens/core/view";
import { type JSX, useSyncExternalStore } from "react";
import type { ConsoleApi } from "../../model/console.js";
import { kindName } from "../../model/format.js";
import { RecordActions } from "../inspector.js";
import {
	Button,
	FilterBar,
	KeyValue,
	Panel,
	Select,
	Table,
} from "../primitives.js";
import type { ScreenProps } from "../screen-props.js";

// #region COMPONENT_ReviewTable
/**
 * @purpose Show one list of notes with the review date and the five record actions.
 * @invariants The table states the count of its rows. An empty table states that fact.
 * @invariants The delete action follows the delete permission of the view.
 */
interface ReviewTableProps {
	readonly api: ConsoleApi;
	readonly title: string;
	readonly right: string;
	readonly items: readonly DueRecord[];
	readonly allowDelete: boolean;
}

function ReviewTable({
	api,
	title,
	right,
	items,
	allowDelete,
}: ReviewTableProps): JSX.Element {
	const t = api.t;
	return (
		<Panel title={title} right={right}>
			<Table
				headers={[
					t("address"),
					t("text"),
					t("kind"),
					t("reviewDate"),
					t("actions"),
				]}
				rows={items.map((item) => [
					<Button
						key={item.addr}
						text={item.addr}
						onClick={() => void api.call.openInTree(item.addr)}
					/>,
					item.body,
					kindName(t, item.kind),
					item.review_at ? dayOf(item.review_at) : t("none"),
					<RecordActions
						key={item.addr}
						api={api}
						target={item.addr}
						disabled={!allowDelete}
					/>,
				])}
				empty={t("none")}
			/>
		</Panel>
	);
}
// #endregion COMPONENT_ReviewTable

// #region COMPONENT_Review
/**
 * @purpose List the due notes of the selected scope and the next notes.
 * @invariants A kind choice reloads the view with that one kind.
 */
export function Review({ api }: ScreenProps): JSX.Element | null {
	const state = useSyncExternalStore(
		api.subscribe,
		() => api.state,
		() => api.state,
	);
	const model = state.model;
	if (!model) return null;
	const t = api.t;
	const due = model.review ?? [];
	const dueTotal = model.reviewTotal ?? 0;
	const next = model.reviewNext ?? [];
	const nextTotal = model.reviewNextTotal ?? 0;
	const policy = model.reviewPolicy;
	const kinds = [
		{ value: "", label: t("allKinds") },
		...NOTE_KINDS.map((kind) => ({ value: kind, label: kindName(t, kind) })),
	];
	const periods = Object.entries(policy ?? {}).map(
		([name, days]) =>
			[kindName(t, name as NoteKind), t("days", { count: days })] as const,
	);
	return (
		<>
			<p className="sub">{t("revText")}</p>
			<FilterBar
				filters={[
					{
						label: t("kindLabel"),
						control: (
							<Select
								value={state.reviewKind}
								options={kinds}
								onChange={(value) =>
									void api.call.reload(value as NoteKind | "")
								}
							/>
						),
					},
				]}
			/>
			<ReviewTable
				api={api}
				title={t("due")}
				right={`${due.length} / ${dueTotal}`}
				items={due}
				allowDelete={model.allowDelete}
			/>
			<ReviewTable
				api={api}
				title={t("next")}
				right={`${next.length} / ${nextTotal}`}
				items={next}
				allowDelete={model.allowDelete}
			/>
			{policy ? (
				<Panel
					title={t("reviewPeriods")}
					right={String(Object.keys(policy).length)}
				>
					<KeyValue rows={periods} />
				</Panel>
			) : null}
		</>
	);
}
// #endregion COMPONENT_Review
