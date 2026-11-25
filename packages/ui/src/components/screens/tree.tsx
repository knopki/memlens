/**
 * #region moduleContract
 * @purpose Show the frontier of the selected scope beside the inspector, so a human opens one line
 * and reads its record.
 * @scope The frontier list, the line rows, the legend, the children panel, and the inspector. NOT:
 * the host calls and the address.
 * @invariants A range line opens its children, and a note line opens its record. A temporary line
 * shows the text of its range.
 * @invariants The live count of the scope comes from the scope panel. The range title comes from the
 * open children, so the screen reads no record row and no node row.
 * @keywords tree, frontier, line, range, note, inspector, react
 * #endregion moduleContract
 */

import type { OpenLine, SliceLine } from "@memlens/core";
import { dateSpan } from "@memlens/core/view";
import { type JSX, useSyncExternalStore } from "react";
import type { ConsoleApi } from "../../model/console.js";
import { lineAddress, lineText } from "../../model/format.js";
import { Inspector } from "../inspector.js";
import { ChildrenPanel, Legend } from "../line-views.js";
import { Button, Panel } from "../primitives.js";
import type { ScreenProps } from "../screen-props.js";

// #region COMPONENT_FrontierLine
/**
 * @purpose Show one line of the frontier and open its target.
 * @invariants A temporary line takes the pending class. The selected line takes the sel class.
 */
interface FrontierLineProps {
	readonly api: ConsoleApi;
	readonly scope: string;
	readonly line: SliceLine;
	readonly selected: boolean;
}

function FrontierLine({
	api,
	scope,
	line,
	selected,
}: FrontierLineProps): JSX.Element {
	const target = lineAddress(scope, line);
	const text = lineText(line);
	const className = [
		"line",
		line.kind[0],
		line.kind === "temporary" ? "pending" : "",
		selected ? "sel" : "",
	]
		.filter(Boolean)
		.join(" ");
	return (
		<Button
			className={className}
			title={text || dateSpan(line.from, line.to)}
			onClick={() => void api.call.openTarget(target)}
		>
			<span className="id">{target}</span>
			<span className="tx">{text || dateSpan(line.from, line.to)}</span>
		</Button>
	);
}
// #endregion COMPONENT_FrontierLine

// #region COMPONENT_ChildLine
/**
 * @purpose Show one child line of an open range and open that child.
 * @invariants A child without a summary takes the pending class.
 */
interface ChildLineProps {
	readonly api: ConsoleApi;
	readonly line: OpenLine;
}

function ChildLine({ api, line }: ChildLineProps): JSX.Element {
	return (
		<Button
			className={line.built ? "line" : "line pending"}
			title={line.text || dateSpan(line.ts_from, line.ts_to)}
			onClick={() => void api.call.openTarget(line.addr)}
		>
			<span className="id">{line.addr}</span>
			<span className="tx">
				{line.text || dateSpan(line.ts_from, line.ts_to)}
			</span>
		</Button>
	);
}
// #endregion COMPONENT_ChildLine

// #region COMPONENT_TreeView
/**
 * @purpose Show the frontier of the selected scope beside the inspector.
 * @invariants A range line opens its children, and a note line opens its record. A temporary line
 * shows the text of its range.
 * @invariants The live count of the scope comes from the scope panel. The range title comes from the
 * open children, so the screen reads no record row and no node row.
 */
export function TreeView({ api }: ScreenProps): JSX.Element | null {
	const state = useSyncExternalStore(
		api.subscribe,
		() => api.state,
		() => api.state,
	);
	const model = state.model;
	if (!model) return null;
	const lines = model.frontier ?? [];
	const live = model.scopes.find((item) => item.key === state.scope)?.live ?? 0;
	const selection = state.selection;
	const children = selection?.result;
	const target = selection?.target.startsWith("#")
		? `${state.scope}${selection.target}`
		: selection?.target;
	const selectedLine = lines.find(
		(line) => lineAddress(state.scope, line) === target,
	);
	// The host names the open range. The frontier line names it before the open answers.
	const rangeText =
		children?.kind === "children"
			? children.text || (selectedLine ? lineText(selectedLine) : "")
			: "";
	return (
		<>
			<p className="sub">{api.t("treeText")}</p>
			<div className="split">
				<Panel
					title={api.t("frontier")}
					right={api.t("frontierMeta", {
						ranges: lines.length,
						live,
					})}
				>
					<Legend api={api} kinds={["record", "summary", "temporary"]} />
					<div className="lines">
						{lines.length ? (
							lines.map((line) => (
								<FrontierLine
									key={lineAddress(state.scope, line)}
									api={api}
									scope={state.scope}
									line={line}
									selected={
										selection?.target === lineAddress(state.scope, line)
									}
								/>
							))
						) : (
							<p className="muted">{api.t("noFrontier")}</p>
						)}
					</div>
				</Panel>
				{selection ? (
					<Inspector api={api} rangeText={rangeText} />
				) : (
					<Panel title={api.t("inspector")} className="ins">
						<p className="muted">{api.t("selectLine")}</p>
					</Panel>
				)}
			</div>
			{children?.kind === "children" ? (
				<div className="column">
					<ChildrenPanel
						api={api}
						title={`${api.t("children")} · ${selection?.target ?? ""}`}
						rows={children.children.map((child) => (
							<ChildLine key={child.addr} api={api} line={child} />
						))}
					/>
				</div>
			) : null}
		</>
	);
}
// #endregion COMPONENT_TreeView
