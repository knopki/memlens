/**
 * #region moduleContract
 * @purpose Supply shared console models from the store rows for each host.
 * @scope Scope panels, context, trees, catalog, build candidates, and review lists.
 * @invariants Read the store rows only. Open no file. Import no DOM, transport, or style.
 * @invariants Exclude scopes outside the profile. Return JSON values from one store clock value.
 * @invariants The review list holds the due notes of the selected scope. The reviewNext list holds
 * the nearest notes of the selected scope with a later review time, at most ten, and reviewNextTotal
 * counts them before the cap. A kind selects one kind and null takes each kind.
 * @invariants The frontier holds the slice lines of the selected scope, in the same order and with
 * the same fold as the text of the slice. A range line hides the notes inside that range.
 * @dependencies store/reads.ts, store/view.ts, domain/context.ts, domain/reads.ts, domain/tree.ts
 * @keywords console, model, frontier, catalog, directions, review, candidates, scope
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { directionsData, liveCounts, nodesOf } from "../store/reads.js";
import type { Store } from "../store/store.js";
import type { Node, Note } from "../store/types.js";
import {
	loadView,
	nodeValid,
	sliceOf,
	textOfLine,
	type View,
} from "../store/view.js";
import { MemlensError } from "../types/errors.js";
import type { NoteKind, ScopeKey } from "../types/events.js";
import type { Range, SliceLine } from "../types/tree.js";
import { visibleScopes } from "./active-scope.js";
import type { ResolvedConfig } from "./config.js";
import { directionLines, hereLines, renderContext } from "./context.js";
import { type DueRecord, dueRecords, upcomingRecords } from "./reads.js";
import { validateScopeKey } from "./scope.js";
import { nowIso } from "./time.js";

const debug = debuglog("memlens:console");

/** The number of the nearest records that the review screen shows at most. */
const NEXT_LIMIT = 10;

// #region CLASS_ConsoleModel

/** @purpose Give console hosts one serializable view of the visible memory. */
export interface ConsoleModel {
	readonly profile: string;
	readonly scope: ScopeKey;
	readonly scopes: readonly {
		readonly key: ScopeKey;
		readonly total: number;
		readonly live: number;
		readonly hidden: number;
		readonly deleted: number;
		readonly frontier: string;
	}[];
	readonly here: string;
	readonly directions: string;
	readonly text: string;
	readonly budgets: {
		readonly here: { readonly used: number; readonly limit: number };
		readonly directions: { readonly used: number; readonly limit: number };
	};
	readonly records: readonly ReturnType<typeof recordOf>[];
	readonly nodes: readonly {
		readonly scope: ScopeKey;
		readonly node: Node;
		readonly clean: boolean;
	}[];
	readonly candidates: readonly {
		readonly scope: string;
		readonly range: Range;
		readonly ready: boolean;
	}[];
	readonly catalog: readonly SliceLine[];
	/** The scope of each catalog position, in the order of the catalog tree. */
	readonly catalogScopes: readonly ScopeKey[];
	readonly frontier: readonly SliceLine[];
	readonly review: readonly DueRecord[];
	readonly reviewNext: readonly DueRecord[];
	readonly reviewNextTotal: number;
	readonly revision: string;
}

// #endregion CLASS_ConsoleModel

/** The visible scope keys of one console read. */
interface ScopeSet {
	readonly keys: readonly ScopeKey[];
	readonly selected: ScopeKey;
}

// #region FUNC_readConsole

/**
 * @purpose Read one console snapshot for the selected visible scope.
 * @invariants Keep explicit empty scopes. Accept an absent selected scope when the profile matches it.
 * @invariants The review lists hold the notes of the selected scope only, so a scope choice narrows
 * the review screen. A null kind keeps each kind.
 * @invariants Use the resolved profile name and independent line budgets. Read no event export and
 * call no compaction. The revision is the store clock of one read.
 * @invariants The catalog scopes hold the scope of each catalog position, in the order of the
 * catalog tree, so a host maps a line position to its scope.
 */
export async function readConsole(
	store: Store,
	config: ResolvedConfig,
	scope: ScopeKey,
	now?: string,
	kind: NoteKind | null = null,
): Promise<ConsoleModel> {
	debug("Console read start", { event: "start", scope });
	return store.read(() =>
		readStoreConsole(store, config, scope, now ?? nowIso(), kind),
	);
}

// #endregion FUNC_readConsole

// #region FUNC_readStoreConsole

/**
 * @purpose Read one console snapshot from the rows of one store.
 * @invariants The revision is the store clock of one read, so the model and the epoch agree.
 * @invariants The directions come from the store read and the top line of each budgeted scope.
 * @invariants The catalog holds one leaf for each budgeted scope, in the order of the directions.
 */
function readStoreConsole(
	store: Store,
	config: ResolvedConfig,
	scope: ScopeKey,
	time: string,
	kind: NoteKind | null,
): ConsoleModel {
	const profile = config.defaultProfile;
	const known = [...liveCounts(store).keys()];
	const set = scopeSet(config, known, scope);
	const views = new Map<ScopeKey, View>(
		set.keys.map((key) => [key, loadView(store.handle(), key)]),
	);
	const hereView = requireView(views, set.selected);
	const links = supersedesOf(store, set.keys);
	const data = directionsData(store, set.keys, config.budget.directions);
	const lines = data.lines.map((line) => ({
		...line,
		summary: topText(store, line.scope),
	}));
	const next = upcomingRecords(store, [set.selected], time, NEXT_LIMIT, kind);
	const model: ConsoleModel = {
		profile,
		scope: set.selected,
		scopes: set.keys.map((key) => scopePanel(key, views, config)),
		here: hereLines(hereView, config.budget.here),
		directions: directionLines(lines, data.rest, time),
		text: renderContext({
			scope: set.selected,
			here: hereView,
			hereBudget: config.budget.here,
			directions: lines,
			older: data.rest,
			now: time,
			...(config.customPrompt === null
				? {}
				: { customPrompt: config.customPrompt }),
			...(config.customPromptAppend === null
				? {}
				: { customPromptAppend: config.customPromptAppend }),
		}),
		budgets: {
			here: {
				used: sliceOf(hereView, config.budget.here).length,
				limit: config.budget.here,
			},
			directions: { used: lines.length, limit: config.budget.directions },
		},
		records: set.keys.flatMap((key) =>
			requireView(views, key).notes.map((row) => recordOf(row, links)),
		),
		nodes: set.keys.flatMap((key) =>
			nodesOf(store, key).map((node) => ({
				scope: key,
				node,
				clean: nodeValid(requireView(views, key), node),
			})),
		),
		candidates: set.keys.flatMap((key) =>
			candidatesOf(requireView(views, key)).map((range) => ({
				scope: key,
				range,
				ready: true,
			})),
		),
		catalog: lines.map((line, pos) => ({
			kind: "temporary",
			range: { start: pos, level: 0 },
			from: line.lastWrite,
			to: line.lastWrite,
			text: line.summary ?? "",
		})),
		catalogScopes: lines.map((line) => line.scope),
		frontier: sliceOf(hereView, config.budget.here),
		review: dueRecords(store, [set.selected], time, kind),
		reviewNext: next.records,
		reviewNextTotal: next.total,
		revision: store.rev(),
	};
	debug("Console read", {
		profile,
		scope: set.selected,
		scopes: model.scopes.length,
		records: model.records.length,
		nodes: model.nodes.length,
		frontier: model.frontier.length,
		kind,
		due: model.review.length,
		next: `${model.reviewNext.length}/${model.reviewNextTotal}`,
	});
	return model;
}

// #endregion FUNC_readStoreConsole

/** @purpose Give one scope panel of the console from the rows of one store. */
function scopePanel(
	key: ScopeKey,
	views: ReadonlyMap<ScopeKey, View>,
	config: ResolvedConfig,
) {
	const view = requireView(views, key);
	const count = (state: string) =>
		view.notes.filter((row) => row.state === state).length;
	return {
		key,
		total: view.notes.length,
		live: count("live"),
		hidden: count("hidden"),
		deleted: count("deleted"),
		frontier: hereLines(view, config.budget.here),
	};
}

/** @purpose Give the top line text of one scope from its rows. */
function topText(store: Store, scope: ScopeKey): string | null {
	const top = sliceOf(loadView(store.handle(), scope), 1).at(-1);
	return top === undefined ? null : textOfLine(top);
}

// #region FUNC_candidatesOf

/**
 * @purpose List the ranges of one view that lack a valid node, so a compaction has work.
 * @invariants Each level from one to the top of the extent gives one range for each live slot.
 * A range with a valid node row is no candidate. The order is the level, then the start.
 */
export function candidatesOf(view: View): readonly Range[] {
	const slots = view.notes
		.filter((row) => row.state === "live")
		.map((row) => row.pos);
	const last = view.notes[view.notes.length - 1];
	if (last === undefined) return [];
	const top = Math.max(1, Math.ceil(Math.log2(last.pos + 1)));
	const ranges = new Map<string, Range>();
	for (const pos of slots) {
		for (let level = 1; level <= top; level += 1) {
			const start = Math.floor(pos / 2 ** level) * 2 ** level;
			ranges.set(`${level}:${start}`, { start, level });
		}
	}
	const result = [...ranges.values()]
		.filter((range) => {
			const node = view.nodes.find(
				(row) => row.level === range.level && row.start === range.start,
			);
			return node === undefined || !nodeValid(view, node);
		})
		.sort((a, b) => a.level - b.level || a.start - b.start);
	debug("Candidates listed", { slots: slots.length, count: result.length });
	return result;
}

// #endregion FUNC_candidatesOf

/** @purpose Give the visible scope keys of one console read, and the selected key. */
function scopeSet(
	config: ResolvedConfig,
	known: readonly ScopeKey[],
	scope: ScopeKey,
): ScopeSet {
	const keys = visibleScopes(config.profile.scopes, [
		...new Set([
			...known,
			...config.profile.scopes.filter(validateScopeKey),
			scope,
		]),
	]);
	if (!validateScopeKey(scope) || !keys.includes(scope)) {
		throw new MemlensError("NotAllowed", `Scope is not visible: ${scope}`);
	}
	return { keys, selected: scope };
}

/** @purpose Give one view of the read, or refuse the read when the scope is absent. */
function requireView(views: ReadonlyMap<ScopeKey, View>, key: ScopeKey): View {
	const view = views.get(key);
	if (view === undefined)
		throw new MemlensError("Data", `The read holds no view of ${key}.`);
	return view;
}

/** @purpose Give the record shape of the console from one note row. */
/** @purpose Build the reverse supersede map of the visible scopes: each source names its targets. */
function supersedesOf(
	store: import("../store/store.js").Store,
	keys: readonly ScopeKey[],
): ReadonlyMap<string, string[]> {
	const links = new Map<string, string[]>();
	if (keys.length === 0) return links;
	const placeholders = keys.map(() => "?").join(", ");
	const rows = store
		.handle()
		.prepare(
			`SELECT id, superseded_by FROM notes WHERE superseded_by IS NOT NULL AND scope IN (${placeholders})`,
		)
		.all(...keys) as { id: string; superseded_by: string }[];
	for (const row of rows) {
		const list = links.get(row.superseded_by) ?? [];
		list.push(row.id);
		links.set(row.superseded_by, list);
	}
	return links;
}

function recordOf(row: Note, links: ReadonlyMap<string, string[]>) {
	return {
		id: row.id,
		scope: row.scope,
		pos: row.pos,
		order: `${row.modified_at}|${row.id}` as const,
		state: row.state,
		body: row.body,
		kind: row.kind,
		ts: row.ts,
		review_at: row.review_at,
		recorded_at: row.created_at,
		modified_at: row.modified_at,
		longform: row.longform,
		refs: row.refs,
		supersedes: links.get(row.id) ?? [],
		superseded_by: row.superseded_by,
		content_cleared: row.cleared,
		session: row.session,
		turn: row.turn,
		preset: row.preset,
	};
}

/** @purpose Give the tree node shape of the console from one node row. */
