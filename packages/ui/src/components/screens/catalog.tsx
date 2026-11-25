/**
 * #region moduleContract
 * @purpose Show the direction lines of the visible scopes with their budget, and open one part of
 * the catalog.
 * @scope The catalog list, the legend, the detail panel, and the range rows. NOT: the open calls
 * and the address.
 * @invariants A range line opens its two halves in the panel beside the list. A line over one scope
 * opens the tree of that scope.
 * @invariants The list takes the legend of the two kinds that a catalog line can hold. The budget
 *   shows only when the read holds it.
 * @keywords catalog, direction, range, scope, budget, children, react
 * #endregion moduleContract
 */

import type { Range, ScopeKey, SliceLine } from "@memlens/core";
import { dateSpan } from "@memlens/core/view";
import type { JSX } from "react";
import { useSyncExternalStore } from "react";
import type { ConsoleApi } from "../../model/console.js";
import { lineText, readRange, renderRange } from "../../model/format.js";
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
	readonly scopes: readonly ScopeKey[];
	readonly line: SliceLine;
	readonly selected: boolean;
}

function CatalogLine({
	api,
	scopes,
	line,
	selected,
}: CatalogLineProps): JSX.Element {
	const range = catalogRange(line);
	const scope = range.level === 0 ? scopes[range.start] : undefined;
	const text = lineText(line);
	const name = catalogName(scopes, range);
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

function catalogRange(line: SliceLine): Range {
	return line.kind === "record" ? { start: line.pos, level: 0 } : line.range;
}

function catalogTarget(line: SliceLine): string {
	return renderRange(null, catalogRange(line));
}

function catalogName(scopes: readonly ScopeKey[], range: Range): string {
	const covered = scopes.slice(range.start, range.start + 2 ** range.level);
	return covered.join(",") || renderRange(null, range);
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
	const scopes = model.catalogScopes ?? [];
	const lines = model.catalog ?? [];
	const selection = state.selection;
	const result = selection?.result;
	const target = selection?.target ?? "";
	const openRange = readRange(target);
	const detail =
		result?.kind === "catalog" ? (
			<ChildrenPanel
				api={api}
				title={`${api.t("children")} · ${openRange ? catalogName(scopes, openRange) : target}`}
				rows={result.children.map((line) => (
					<CatalogLine
						key={catalogTarget(line)}
						api={api}
						scopes={scopes}
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
					right={
						model.budgets
							? api.t("lines", {
									used: model.budgets.directions.used,
									limit: model.budgets.directions.limit,
								})
							: ""
					}
				>
					<Legend api={api} kinds={["summary", "temporary"]} />
					<div className="lines">
						{lines.length ? (
							lines.map((line) => (
								<CatalogLine
									key={catalogTarget(line)}
									api={api}
									scopes={scopes}
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
