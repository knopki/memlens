/**
 * #region moduleContract
 * @purpose Supply the display model of one console screen from selective store reads.
 * @scope Visible scopes, context, flat frontier lines, catalog, review, and maintenance counts.
 * @invariants Each answer holds only the requested screen data and the shared scope list.
 * @invariants The due list and the candidate list keep at most CONSOLE_LIST_LIMIT rows. A total
 * counts every row before its cap.
 * @keywords console, screen, frontier, catalog, review, selective
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import {
	CONSOLE_LIST_LIMIT,
	ConsoleReader,
	reviewRows,
	type ScopeCount,
	scopeCounts,
} from "../store/console.js";
import { type DirectionLine, directionsData } from "../store/reads.js";
import type { Store } from "../store/store.js";
import { textOfLine } from "../store/view.js";
import { MemlensError } from "../types/errors.js";
import type { ConsoleScreen, NoteKind, ScopeKey } from "../types/primitives.js";
import type { Range, SliceLine } from "../types/tree.js";
import { visibleScopes } from "./active-scope.js";
import { renderAddress } from "./address-form.js";
import type { ResolvedConfig } from "./config-types.js";
import { renderContext } from "./context.js";
import type { DueRecord } from "./reads.js";
import { concreteScopeKey, validateScopeKey } from "./scope.js";
import { nowIso } from "./time.js";

const debug = debuglog("memlens:console");

export { CONSOLE_SCREENS, type ConsoleScreen } from "../types/primitives.js";

// #region INTERFACE_ConsoleModel
/** @purpose Carry shared scope facts and only the data of the requested screen. */
export interface ConsoleModel {
	readonly screen: ConsoleScreen;
	readonly profile: string;
	readonly scope: ScopeKey;
	readonly scopes: readonly {
		readonly key: ScopeKey;
		readonly total: number;
		readonly live: number;
		readonly hidden: number;
		readonly deleted: number;
	}[];
	readonly revision: string;
	readonly text?: string;
	readonly budgets?: {
		readonly here: { readonly used: number; readonly limit: number };
		readonly directions: { readonly used: number; readonly limit: number };
	};
	readonly frontier?: readonly SliceLine[];
	readonly catalog?: readonly SliceLine[];
	readonly catalogScopes?: readonly ScopeKey[];
	readonly review?: readonly DueRecord[];
	readonly reviewTotal?: number;
	readonly reviewNext?: readonly DueRecord[];
	readonly reviewNextTotal?: number;
	readonly candidates?: readonly {
		readonly scope: string;
		readonly range: Range;
	}[];
	readonly totals?: {
		readonly records: number;
		readonly nodes: number;
		readonly candidates: number;
	};
	readonly levels?: readonly {
		readonly level: number;
		readonly nodes: number;
		readonly dirty: number;
		readonly candidates: number;
	}[];
}
// #endregion INTERFACE_ConsoleModel

// #region FUNC_scopePanels
/** @purpose Read scope counts without note content, and preserve explicit empty scopes. */
function scopePanels(
	store: Store,
	config: ResolvedConfig,
	scope: ScopeKey,
): readonly ScopeCount[] {
	const rows = scopeCounts(store);
	const keys = visibleScopes(config.profile.scopes, [
		...new Set([
			...rows.filter((row) => row.live > 0).map((row) => row.key),
			...config.profile.scopes.filter(concreteScopeKey),
			scope,
		]),
	]);
	if (!validateScopeKey(scope) || !keys.includes(scope))
		throw new MemlensError("NotAllowed", `Scope is not visible: ${scope}`);
	const counts = new Map(rows.map((row) => [row.key, row]));
	return keys.map(
		(key) =>
			counts.get(key) ?? { key, total: 0, live: 0, hidden: 0, deleted: 0 },
	);
}
// #endregion FUNC_scopePanels

// #region FUNC_readConsole
/**
 * @purpose Read only the display data of one screen in one store transaction.
 * Keep the review kind and time independent of the requested screen.
 */
export async function readConsole(
	store: Store,
	config: ResolvedConfig,
	scope: ScopeKey,
	now?: string,
	kind: NoteKind | null = null,
	screen: ConsoleScreen = "overview",
): Promise<ConsoleModel> {
	return store.read(() => {
		const scopes = scopePanels(store, config, scope);
		const model: ConsoleModel = {
			screen,
			profile: config.defaultProfile,
			scope,
			scopes,
			revision: store.rev(),
		};
		const readers = new Map<ScopeKey, ConsoleReader>();
		const reader = (key: ScopeKey): ConsoleReader => {
			let value = readers.get(key);
			if (!value) {
				value = new ConsoleReader(store.handle(), key);
				readers.set(key, value);
			}
			return value;
		};
		let data: Partial<ConsoleModel> = {};
		if (screen === "overview" || screen === "session") {
			const frontier = reader(scope).slice(config.budget.here);
			const directions = consoleDirections(
				store,
				config,
				scopes.map((row) => row.key),
				reader,
			);
			data = {
				text: renderContext({
					scope,
					here: frontier,
					hereBudget: config.budget.here,
					directions: directions.lines,
					older: directions.rest,
					now: now ?? nowIso(),
					...(config.customPrompt === null
						? {}
						: { customPrompt: config.customPrompt }),
					...(config.customPromptAppend === null
						? {}
						: { customPromptAppend: config.customPromptAppend }),
				}),
				budgets: {
					here: { used: frontier.length, limit: config.budget.here },
					directions: {
						used: directions.lines.length,
						limit: config.budget.directions,
					},
				},
			};
		} else if (screen === "tree") {
			data = { frontier: reader(scope).slice(config.budget.here) };
		} else if (screen === "catalog") {
			const catalog = readCatalog(
				store,
				config,
				scopes.map((row) => row.key),
				reader,
			);
			data = { catalog: catalog.lines, catalogScopes: catalog.scopes };
		} else if (screen === "review") {
			data = readReview(store, scope, now ?? nowIso(), kind);
		} else if (screen === "maintenance") {
			data = maintenance(store, config, scope, scopes, reader);
		}
		debug("Console screen read", {
			screen,
			scope,
			scopes: scopes.length,
			readers: readers.size,
		});
		return { ...model, ...data };
	});
}
// #endregion FUNC_readConsole

// #region FUNC_consoleDirections
/** @purpose Read only the top lines inside the directions budget. */
function consoleDirections(
	store: Store,
	config: ResolvedConfig,
	scopes: readonly ScopeKey[],
	reader: (key: ScopeKey) => ConsoleReader,
) {
	const data = directionsData(store, scopes, config.budget.directions);
	const lines: readonly DirectionLine[] = data.lines.map((line) => {
		const top = reader(line.scope).top();
		return { ...line, summary: top ? textOfLine(top) : null };
	});
	return { lines, rest: data.rest };
}
// #endregion FUNC_consoleDirections

// #region FUNC_readCatalog
/** @purpose Read only the displayed scope summaries for the catalog. */
function readCatalog(
	store: Store,
	config: ResolvedConfig,
	keys: readonly ScopeKey[],
	reader: (key: ScopeKey) => ConsoleReader,
	start = 0,
	count = Infinity,
) {
	const data = directionsData(store, keys, config.budget.directions);
	const shown = data.lines.slice(start, start + count);
	const lines: SliceLine[] = shown.map((line, offset) => {
		const top = reader(line.scope).top();
		const range = { start: start + offset, level: 0 };
		return top
			? { ...top, range }
			: {
					kind: "temporary",
					range,
					from: line.newestTs,
					to: line.newestTs,
					text: "",
				};
	});
	return { lines, scopes: shown.map((line) => line.scope) };
}
// #endregion FUNC_readCatalog

// #region FUNC_readConsoleCatalog
/** @purpose Read one catalog interval without another screen model or its unrelated lines. */
export function readConsoleCatalog(
	store: Store,
	config: ResolvedConfig,
	scope: ScopeKey,
	start: number,
	level: number,
): readonly SliceLine[] {
	return store.read(() => {
		const scopes = scopePanels(store, config, scope).map((row) => row.key);
		return readCatalog(
			store,
			config,
			scopes,
			(key) => new ConsoleReader(store.handle(), key),
			start,
			2 ** level,
		).lines;
	});
}
// #endregion FUNC_readConsoleCatalog

// #region FUNC_readReview
/** @purpose Give the review screen bounded lists with addresses, so a large backlog costs no large read or render. */
function readReview(
	store: Store,
	scope: ScopeKey,
	now: string,
	kind: NoteKind | null,
): Partial<ConsoleModel> {
	const rows = reviewRows(store, scope, now, kind);
	const list = (notes: typeof rows.due): readonly DueRecord[] =>
		notes.map((row) => ({
			addr: renderAddress(row.scope, row.pos, null),
			...row,
		}));
	return {
		review: list(rows.due),
		reviewTotal: rows.dueTotal,
		reviewNext: list(rows.next),
		reviewNextTotal: rows.nextTotal,
	};
}
// #endregion FUNC_readReview

// #region FUNC_maintenance
/**
 * @purpose Give build totals and counts by level without complete store rows.
 * @invariants The candidate list keeps at most CONSOLE_LIST_LIMIT rows. The candidate total counts
 *   every candidate.
 */
function maintenance(
	store: Store,
	config: ResolvedConfig,
	selected: ScopeKey,
	scopes: readonly ScopeCount[],
	reader: (key: ScopeKey) => ConsoleReader,
): Partial<ConsoleModel> {
	const candidates: NonNullable<ConsoleModel["candidates"]>[number][] = [];
	let candidateTotal = 0;
	const levels = new Map<
		number,
		{ level: number; nodes: number; dirty: number; candidates: number }
	>();
	let nodes = 0;
	for (const scope of scopes) {
		const stats = reader(scope.key).maintenance();
		nodes += stats.nodes;
		for (const row of stats.levels) {
			const total = levels.get(row.level) ?? {
				level: row.level,
				nodes: 0,
				dirty: 0,
				candidates: 0,
			};
			total.nodes += row.nodes;
			total.dirty += row.dirty;
			total.candidates += row.candidates;
			levels.set(row.level, total);
		}
		candidateTotal += stats.candidates.length;
		if (candidates.length < CONSOLE_LIST_LIMIT)
			candidates.push(
				...stats.candidates
					.slice(0, CONSOLE_LIST_LIMIT - candidates.length)
					.map((range) => ({
						scope: scope.key,
						range,
					})),
			);
	}
	const directionCount = directionsData(
		store,
		scopes.map((row) => row.key),
		config.budget.directions,
	).lines.length;
	return {
		candidates,
		totals: {
			records: scopes.reduce((sum, row) => sum + row.total, 0),
			nodes,
			candidates: candidateTotal,
		},
		levels: [...levels.values()].sort((a, b) => a.level - b.level),
		budgets: {
			here: {
				used: reader(selected).lineCount(config.budget.here),
				limit: config.budget.here,
			},
			directions: { used: directionCount, limit: config.budget.directions },
		},
	};
}
// #endregion FUNC_maintenance
