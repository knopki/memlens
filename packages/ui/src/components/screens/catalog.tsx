/**
 * #region moduleContract
 * @purpose Show the direction lines of the visible scopes with their budget, and open one part of
 * the catalog.
 * @scope The catalog list, the legend, the detail panel, and the range rows. NOT: the open calls
 * and the address.
 * @invariants A range line opens its two halves in the panel beside the list. A line over one scope
 * opens the tree of that scope.
 * @invariants The list takes the legend of the two kinds that a catalog line can hold.
 * @dependencies USES: the line views, the primitives, the console api, and the format helpers.
 * @keywords catalog, direction, range, scope, budget, children, react
 * #endregion moduleContract
 */

import type { JSX } from "react";
import { useSyncExternalStore } from "react";
import { dateSpan } from "../../../../core/src/domain/date-span.js";
import type { Range, SliceLine } from "../../../../core/src/types/tree.js";
import type { ConsoleApi } from "../../model/console.js";
import { lineText, rangeId, rangeOf } from "../../model/format.js";
import type { View } from "../../types.js";
import { ChildrenPanel, Legend } from "../line-views.js";
import { Button, Panel } from "../primitives.js";
import type { ScreenProps } from "../screen-props.js";

// #region COMPONENT_CatalogLine
/**
 * @purpose Show one catalog line and open its range or its scope.
 * @invariants A line of level 0 opens the tree of the scope under that position. A larger range
 * opens its two halves.
 */
interface CatalogLineProps {
	readonly api: ConsoleApi;
	readonly model: View;
	readonly line: SliceLine;
	readonly selected: boolean;
}

function CatalogLine({
	api,
	model,
	line,
	selected,
}: CatalogLineProps): JSX.Element {
	const range = catalogRange(line);
	const scope =
		range.level === 0 ? model.catalogScopes[range.start] : undefined;
	const text = lineText(line);
	const name = catalogName(model, range);
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
			title={text || api.t("notBuilt")}
			onClick={() => {
				if (scope) void api.call.openScopeTree(scope);
				else void api.call.openCatalog(range);
			}}
		>
			<span className="id" title={name}>
				{name}
			</span>
			<span className="tx">{text || dateSpan(line.from, line.to)}</span>
		</Button>
	);
}
// #endregion COMPONENT_CatalogLine

/** The range that one catalog line covers. */
function catalogRange(line: SliceLine): Range {
	return line.kind === "record" ? { start: line.pos, level: 0 } : line.range;
}

/** The target of one catalog line, as the selection names it. */
function catalogTarget(line: SliceLine): string {
	return rangeId(catalogRange(line));
}

/** The name of one catalog range for a human: the scope keys it covers, or its range id. */
function catalogName(model: View, range: Range): string {
	const covered = model.catalogScopes.slice(
		range.start,
		range.start + 2 ** range.level,
	);
	return covered.join(",") || rangeId(range);
}

// #region COMPONENT_Catalog
/**
 * @purpose Show the direction lines of the visible scopes with their budget.
 * @invariants The list holds one line for each catalog range of the model. The detail panel holds
 * the two halves of the open range. It holds the hint text when no range is open.
 */
export function Catalog({ api }: ScreenProps): JSX.Element {
	const state = useSyncExternalStore(
		api.subscribe,
		() => api.state,
		() => api.state,
	);
	const model = state.model;
	if (!model) return <></>;
	const selection = state.selection;
	const result = selection?.result;
	const target = selection?.target ?? "";
	const detail =
		result?.kind === "catalog" ? (
			<ChildrenPanel
				api={api}
				title={`${api.t("children")} · ${catalogName(model, rangeOf(target))}`}
				rows={result.children.map((line) => (
					<CatalogLine
						key={catalogTarget(line)}
						api={api}
						model={model}
						line={line}
						selected={catalogTarget(line) === target}
					/>
				))}
			/>
		) : (
			<Panel title={api.t("children")}>
				<p className="muted">{api.t("selectLine")}</p>
			</Panel>
		);
	return (
		<>
			<p className="sub">{api.t("catText")}</p>
			<div className="split keys">
				<Panel
					title={api.t("catLines")}
					right={api.t("lines", {
						used: model.budgets.directions.used,
						limit: model.budgets.directions.limit,
					})}
				>
					<Legend api={api} kinds={["summary", "temporary"]} />
					<div className="lines">
						{model.catalog.length ? (
							model.catalog.map((line) => (
								<CatalogLine
									key={catalogTarget(line)}
									api={api}
									model={model}
									line={line}
									selected={catalogTarget(line) === target}
								/>
							))
						) : (
							<p className="muted">{api.t("emptyCatalog")}</p>
						)}
					</div>
				</Panel>
				{detail}
			</div>
		</>
	);
}
// #endregion COMPONENT_Catalog
