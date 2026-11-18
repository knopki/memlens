/**
 * #region moduleContract
 * @purpose Give the tree and catalog screens one React legend and one children panel. The two
 * screens name a line kind in the same way.
 * @scope The kind labels, the legend, and the children panel. NOT: the line row and the open calls.
 * @invariants Each text comes from the message table of the api.
 * @invariants The panel states the count of its rows. An empty panel states that fact.
 * @keywords legend, children, line, kind, panel, react
 * #endregion moduleContract
 */

import type { SliceLine } from "@memlens/core";
import type { JSX, ReactNode } from "react";
import type { Table } from "../i18n.js";
import type { ConsoleApi } from "../model/console.js";
import { Panel } from "./primitives.js";

/** The message key of each line kind. */
const KIND_LABELS = {
	record: "record",
	summary: "clean",
	temporary: "pending",
} as const satisfies Record<SliceLine["kind"], keyof Table>;

// #region COMPONENT_Legend
/**
 * @purpose Show the legend of a screen from the kinds that its lines can hold.
 * @invariants The legend names only the kinds that its screen holds.
 */
export interface LegendProps {
	readonly api: ConsoleApi;
	readonly kinds: readonly SliceLine["kind"][];
}

export function Legend({ api, kinds }: LegendProps): JSX.Element {
	return (
		<div className="legend">
			{kinds.map((kind) => (
				<span key={kind} className={`lg ${kind[0]}`}>
					{api.t(KIND_LABELS[kind])}
				</span>
			))}
		</div>
	);
}
// #endregion COMPONENT_Legend

// #region COMPONENT_ChildrenPanel
/**
 * @purpose Show the panel of the children of one open range.
 * @invariants The panel states the count of its rows. An empty panel states that fact.
 */
export interface ChildrenPanelProps {
	readonly api: ConsoleApi;
	readonly title: string;
	readonly rows: readonly ReactNode[];
}

export function ChildrenPanel({
	api,
	title,
	rows,
}: ChildrenPanelProps): JSX.Element {
	return (
		<Panel title={title} right={String(rows.length)}>
			<div className="lines">
				{rows.length === 0 ? <p className="muted">{api.t("none")}</p> : rows}
			</div>
		</Panel>
	);
}
// #endregion COMPONENT_ChildrenPanel
