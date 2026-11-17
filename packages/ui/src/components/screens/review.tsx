/**
 * #region moduleContract
 * @purpose List the due notes and the next notes of the selected scope with their review dates and
 * their record actions, so a human reviews the notes of one scope.
 * @scope The kind filter, the two note tables, and the review periods. NOT: the reload call, the
 * transport, and the address.
 * @invariants The kind filter keeps one kind in both lists. The next list states its shown count and
 * the count before the cap.
 * @invariants A note body goes into a text node.
 * @dependencies USES: the record actions of the inspector, the primitives, the console api, and the
 * kind name helper.
 * @keywords review, due, next, period, kind, note, actions, react
 * #endregion moduleContract
 */

import type { DueRecord, NoteKind } from "@memlens/core";
import { type JSX, useSyncExternalStore } from "react";
import type { ConsoleApi } from "../../model/console.js";
import { kindName } from "../../model/format.js";
import { KINDS } from "../../route.js";
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
					item.review_at?.slice(0, 10) ?? t("none"),
					<RecordActions
						key="actions"
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
export function Review({ api }: ScreenProps): JSX.Element {
	const state = useSyncExternalStore(
		api.subscribe,
		() => api.state,
		() => api.state,
	);
	const model = state.model;
	if (!model) return <></>;
	const t = api.t;
	const kinds = [
		{ value: "", label: t("allKinds") },
		...KINDS.map((kind) => ({ value: kind, label: kindName(t, kind) })),
	];
	const periods = Object.entries(model.reviewPolicy).map(
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
				right={String(model.review.length)}
				items={model.review}
				allowDelete={model.allowDelete}
			/>
			<ReviewTable
				api={api}
				title={t("next")}
				right={`${model.reviewNext.length} / ${model.reviewNextTotal}`}
				items={model.reviewNext}
				allowDelete={model.allowDelete}
			/>
			<Panel
				title={t("reviewPeriods")}
				right={String(Object.keys(model.reviewPolicy).length)}
			>
				<KeyValue rows={periods} />
			</Panel>
		</>
	);
}
// #endregion COMPONENT_Review
