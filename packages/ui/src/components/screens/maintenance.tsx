/**
 * #region moduleContract
 * @purpose Show the build state, the line budgets, the merge candidates, the compaction job, and
 *   the host runtime state of one scope.
 * @scope The count tiles, the two budgets, the candidate table, the node levels, the runtime
 *   fields, the journal table, and the live refresh of the runtime state. NOT: the store rules,
 *   the address, the styles, and the transport.
 * @invariants The markup holds the element and class names of the DOM console, so the standalone
 *   stylesheet keeps working.
 * @invariants The text comes from `api.t` and the intents from `api.call`.
 * @invariants A runtime field without a value renders no row. The two budgets show only when the
 *   read holds them.
 * @invariants The live refresh starts on mount and stops on cleanup, so another screen holds no
 *   timer. The refresh reads the runtime state only, so it reloads no view.
 * @invariants The merge panel states the shown candidates and the count before the cap.
 * @keywords maintenance, budget, candidate, level, runtime, snapshot, compaction, journal, refresh
 * #endregion moduleContract
 */

import type { JSX } from "react";
import { useEffect } from "react";
import type { ConsoleApi, ConsoleRuntime } from "../../model/console.js";
import { localTime, renderRange } from "../../model/format.js";
import { KeyValue, Panel, Table, widthPercent } from "../primitives.js";
import type { ScreenProps } from "../screen-props.js";
import { CompactionPanel } from "./compaction.js";

// #region COMPONENT_Maintenance
/**
 * @purpose Show the build state, the budgets, the compaction job, and the host runtime state.
 * @invariants The standalone host gives no runtime, so the runtime panel stays out.
 * @invariants The runtime watch runs only while this screen is mounted.
 */
export function Maintenance({ api }: ScreenProps): JSX.Element | null {
	const { t, state } = api;
	const { watchRuntime } = api.call;
	useEffect(() => {
		watchRuntime(true);
		return () => {
			watchRuntime(false);
		};
	}, [watchRuntime]);
	const model = state.model;
	if (!model) return null;
	const totals = model.totals;
	const candidates = model.candidates ?? [];
	return (
		<>
			<p className="sub">{t("maintText")}</p>
			<div className="tiles">
				{tile(totals?.records ?? 0, t("records"))}
				{tile(totals?.nodes ?? 0, t("treeNodes"))}
				{tile(totals?.candidates ?? 0, t("mergeCandidates"))}
			</div>
			{model.budgets ? (
				<Panel title={t("lineBudgets")}>
					{bar("here", model.budgets.here, t("lines", model.budgets.here))}
					{bar(
						"directions",
						model.budgets.directions,
						t("lines", model.budgets.directions),
					)}
				</Panel>
			) : null}
			<Panel
				title={t("mergeCandidates")}
				right={`${candidates.length} / ${totals?.candidates ?? candidates.length}`}
			>
				<Table
					headers={[t("scope"), t("range"), t("level"), t("state")]}
					rows={candidates.map((item) => [
						item.scope,
						renderRange(item.scope, item.range),
						String(item.range.level),
						item.ready ? t("ready") : t("waits"),
					])}
					empty={t("none")}
				/>
			</Panel>
			<Panel title={t("nodesByLevel")}>
				<Table
					headers={[t("level"), t("nodes"), t("dirty"), t("candidates")]}
					rows={(model.levels ?? []).map((level) => [
						String(level.level),
						String(level.nodes),
						String(level.dirty),
						String(level.candidates),
					])}
					empty={t("none")}
				/>
			</Panel>
			<CompactionPanel api={api} />
			{state.runtime ? runtimePanel(api, state.runtime) : null}
		</>
	);
}
// #endregion COMPONENT_Maintenance

function tile(value: number, name: string): JSX.Element {
	return (
		<div className="tile">
			<div className="n">{value}</div>
			<div className="l">{name}</div>
		</div>
	);
}

function bar(
	name: string,
	value: { used: number; limit: number },
	text: string,
): JSX.Element {
	return (
		<div className="bar">
			<span>{name}</span>
			<div className="track">
				<i style={{ width: `${widthPercent(value.used, value.limit)}%` }} />
			</div>
			<span>{text}</span>
		</div>
	);
}

// #region FUNC_runtimePanel
/**
 * @purpose Show the host runtime fields that hold a value.
 * @invariants A field without a value renders no row.
 * @param api - The console API of the page.
 * @param runtime - The runtime state of the host.
 */
function runtimePanel(api: ConsoleApi, runtime: ConsoleRuntime): JSX.Element {
	const { t } = api;
	const rows: [string, string][] = [];
	if (runtime.session !== undefined) rows.push([t("session"), runtime.session]);
	if (runtime.materializedAt !== undefined)
		rows.push([t("materializedAt"), localTime(runtime.materializedAt)]);
	if (runtime.snapshotSaved !== undefined)
		rows.push([
			t("snapshotSaved"),
			runtime.snapshotSaved ? t("savedState") : t("unsavedState"),
		]);
	const store = runtime.store;
	if (store !== undefined) {
		rows.push([t("store"), store.ready ? t("ready") : t("notOpen")]);
		if (store.error !== null) rows.push([t("lastError"), store.error]);
	}
	const compaction = runtime.compaction;
	if (compaction !== undefined) {
		rows.push([t("modelRoute"), `${compaction.provider}/${compaction.model}`]);
		if (compaction.lastRunAt !== null)
			rows.push([t("lastRun"), localTime(compaction.lastRunAt)]);
		if (compaction.nextRunAt !== null)
			rows.push([t("nextRun"), localTime(compaction.nextRunAt)]);
		rows.push([t("attempts"), String(compaction.attempts)]);
		rows.push([t("activeBuilds"), String(compaction.active)]);
		rows.push([
			t("backoff"),
			t("seconds", { count: Math.round(compaction.backoffMs / 1000) }),
		]);
		rows.push([t("failures"), String(compaction.failures)]);
		rows.push([t("dirtyRanges"), String(compaction.dirty)]);
		if (compaction.lastError !== null)
			rows.push([t("lastError"), compaction.lastError]);
	}
	const journal =
		compaction !== undefined && compaction.events.length > 0 ? (
			<Panel
				title={t("workerJournal")}
				right={String(compaction.events.length)}
			>
				<Table
					headers={[t("time"), t("event"), t("details")]}
					rows={[...compaction.events]
						.toReversed()
						.map((entry) => [
							localTime(entry.at),
							t(KIND_KEYS[entry.kind]),
							entry.text,
						])}
					empty={t("none")}
				/>
			</Panel>
		) : null;
	return (
		<>
			<Panel title={t("runtime")}>
				<KeyValue rows={rows} />
			</Panel>
			{journal}
		</>
	);
}
// #endregion FUNC_runtimePanel

/** The message key of each journal event kind. */
const KIND_KEYS = {
	pass: "kindPass",
	retry: "kindRetry",
	error: "kindError",
	call: "kindCall",
} as const;
