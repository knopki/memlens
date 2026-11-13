/**
 * #region moduleContract
 * @purpose Answer each memory read from the rows of one store, so no read scans the log.
 * @scope Note by address or id, due reviews, live counts, scope notes, nodes, and the directions data.
 * @invariants The note reads give a row in any state. A hidden row is evidence, not content loss.
 * @invariants Due reviews take a live row with a review time of now or earlier.
 * @invariants Directions keeps the budget newest scopes and puts each older scope in the rest list.
 * @invariants Each read uses one statement on the store handle. No read opens a long transaction.
 * @dependencies store/store.ts for the handle, store/types.ts for the row shapes, types/events.ts for the key types.
 * @keywords read, note, node, due, review, count, scope, directions, rest
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { IsoTime, NoteKind, ScopeKey, Ulid } from "../types/events.js";
import type { Store } from "./store.js";
import type { Node, Note, NoteState } from "./types.js";

const debug = debuglog("memlens:reads");

/** The columns of one note row, in the order of the note shape. */
const NOTE_COLUMNS =
	"id, scope, pos, state, cleared, kind, body, longform, refs, superseded_by, ts, created_at, modified_at, review_at, reviewed_at, session, turn, preset, v, v_content, v_review";

/**
 * @purpose Give the caller one scope line of the directions block.
 * @invariants The summary stays null until the caller joins the top node line.
 */
export interface DirectionLine {
	/** The scope of the line. */
	readonly scope: ScopeKey;
	/** The wall clock of the last live write of the scope. */
	readonly lastWrite: IsoTime;
	/** The top node line. The caller joins it after this read. */
	readonly summary: string | null;
}

/**
 * @purpose Give the caller the lines inside the budget and the older scopes outside it.
 * @invariants The lines run from the oldest to the newest.
 * @invariants The rest list runs from the newest scope to the oldest.
 */
export interface DirectionsData {
	/** The budgeted scopes, from the oldest to the newest. */
	readonly lines: readonly DirectionLine[];
	/** The older scopes, from the newest to the oldest. */
	readonly rest: readonly ScopeKey[];
}

// #region FUNC_byAddress

/**
 * @purpose Read one note by its slot, so a numeric address maps to one row.
 * @invariants A null scope takes the first scope in key order. The row may be in any state.
 * @returns The note, or null when no row holds the slot.
 */
export function byAddress(
	store: Store,
	scope: ScopeKey | null,
	pos: number,
): Note | null {
	const db = store.handle();
	const row =
		scope === null
			? db
					.prepare(
						`SELECT ${NOTE_COLUMNS} FROM notes WHERE pos = ? ORDER BY scope LIMIT 1`,
					)
					.get(pos)
			: db
					.prepare(
						`SELECT ${NOTE_COLUMNS} FROM notes WHERE scope = ? AND pos = ? LIMIT 1`,
					)
					.get(scope, pos);
	debug("Note by address", {
		event: "by_address",
		scope,
		pos,
		found: row !== undefined,
	});
	return row === undefined ? null : noteFromRow(row);
}

// #endregion FUNC_byAddress

// #region FUNC_byId

/**
 * @purpose Read one note by its cross-store identity, so a caller names it after an import.
 * @returns The note, or null when no row holds the id.
 */
export function byId(store: Store, id: Ulid): Note | null {
	const row = store
		.handle()
		.prepare(`SELECT ${NOTE_COLUMNS} FROM notes WHERE id = ? LIMIT 1`)
		.get(id);
	debug("Note by id", { event: "by_id", found: row !== undefined });
	return row === undefined ? null : noteFromRow(row);
}

// #endregion FUNC_byId

// #region FUNC_dueReviews

/**
 * @purpose List the live notes whose review time has come, so a review needs no scan.
 * @invariants A note with no review time is never due. The order is the review time, then scope, then slot.
 * @returns The due notes, at most the given limit.
 */
export function dueReviews(
	store: Store,
	now: IsoTime,
	limit = 50,
): readonly Note[] {
	const cap = Math.max(0, limit);
	const rows = store
		.handle()
		.prepare(
			`SELECT ${NOTE_COLUMNS} FROM notes
			WHERE state = 'live' AND review_at IS NOT NULL AND review_at <= ?
			ORDER BY review_at, scope, pos
			LIMIT ?`,
		)
		.all(now, cap);
	debug("Due reviews", {
		event: "due_reviews",
		count: rows.length,
		limit: cap,
	});
	return rows.map(noteFromRow);
}

// #endregion FUNC_dueReviews

// #region FUNC_liveCounts

/**
 * @purpose Count the live notes of each scope, so the scope list needs no second query.
 * @invariants A scope with no live note gives no entry.
 * @returns The count of each scope, in scope key order.
 */
export function liveCounts(store: Store): Map<ScopeKey, number> {
	const rows = store
		.handle()
		.prepare(
			"SELECT scope, COUNT(*) AS count FROM notes WHERE state = 'live' GROUP BY scope ORDER BY scope",
		)
		.all();
	const counts = new Map<ScopeKey, number>();
	for (const row of rows)
		counts.set(String(row.scope) as ScopeKey, Number(row.count));
	debug("Live counts", { event: "live_counts", scopes: counts.size });
	return counts;
}

// #endregion FUNC_liveCounts

// #region FUNC_scopeNotes

/**
 * @purpose Give each note row of one scope in slot order, as the raw material of the slice.
 * @invariants The rows may be in any state, because each row holds its slot.
 * @returns The notes from the first slot to the last.
 */
export function scopeNotes(store: Store, scope: ScopeKey): readonly Note[] {
	const rows = store
		.handle()
		.prepare(`SELECT ${NOTE_COLUMNS} FROM notes WHERE scope = ? ORDER BY pos`)
		.all(scope);
	debug("Scope notes", {
		event: "scope_notes",
		scope,
		count: rows.length,
	});
	return rows.map(noteFromRow);
}

// #endregion FUNC_scopeNotes

// #region FUNC_nodesOf

/**
 * @purpose Give each node row of one scope, so the slice renders from the cache.
 * @invariants The order is the level, then the start slot. Each row is a cache entry.
 * @returns The node rows of the scope.
 */
export function nodesOf(store: Store, scope: ScopeKey): readonly Node[] {
	const rows = store
		.handle()
		.prepare(
			"SELECT scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key FROM nodes WHERE scope = ? ORDER BY level, start",
		)
		.all(scope);
	debug("Scope nodes", {
		event: "scope_nodes",
		scope,
		count: rows.length,
	});
	return rows.map(nodeFromRow);
}

// #endregion FUNC_nodesOf

// #region FUNC_directionsData

/**
 * @purpose Give the scope lines of the directions block and the older scopes outside its budget.
 * @invariants The read covers the live notes of the supplied scopes. A scope with no live note gives no entry.
 * @invariants The lines are the budget newest scopes, from the oldest to the newest.
 * @invariants The rest list holds each older scope, from the newest to the oldest.
 * @invariants The summary is null, because the caller joins the top node line later.
 */
export function directionsData(
	store: Store,
	profileScopes: readonly ScopeKey[],
	budget: number,
): DirectionsData {
	const scopes = [...new Set(profileScopes)];
	const cap = Math.max(0, budget);
	if (scopes.length === 0) {
		debug("Directions empty", { event: "directions", scopes: 0, budget: cap });
		return { lines: [], rest: [] };
	}
	const marks = scopes.map(() => "?").join(", ");
	const rows = store
		.handle()
		.prepare(
			`SELECT scope, MAX(modified_at) AS last_write FROM notes
			WHERE state = 'live' AND scope IN (${marks})
			GROUP BY scope`,
		)
		.all(...scopes);
	const marksByWrite = rows
		.map((row) => ({
			scope: String(row.scope) as ScopeKey,
			lastWrite: String(row.last_write),
		}))
		.sort(newerFirst);
	const lines = marksByWrite
		.slice(0, cap)
		.reverse()
		.map((mark) => ({
			...mark,
			summary: null,
			children: [],
		}));
	const rest = marksByWrite.slice(cap).map((mark) => mark.scope);
	debug("Directions read", {
		event: "directions",
		scopes: scopes.length,
		budget: cap,
		lines: lines.length,
		rest: rest.length,
	});
	return { lines, rest };
}

// #endregion FUNC_directionsData

/** Order the scope marks by the last write, the newest first, then by the scope key. */
function newerFirst(
	a: { readonly lastWrite: string; readonly scope: ScopeKey },
	b: { readonly lastWrite: string; readonly scope: ScopeKey },
): number {
	if (a.lastWrite !== b.lastWrite) return a.lastWrite < b.lastWrite ? 1 : -1;
	return a.scope < b.scope ? -1 : a.scope === b.scope ? 0 : 1;
}

/** Read one nullable text column. */
function nullable(value: unknown): string | null {
	return value === null || value === undefined ? null : String(value);
}

// #region FUNC_parseRefs

/**
 * @purpose Read the JSON refs value of one row, so a damaged value never fails a read.
 * @invariants A malformed value or an unknown item gives no ref. The list keeps the string items.
 */
function parseRefs(text: unknown): readonly string[] {
	if (typeof text !== "string" || text === "") return [];
	try {
		const value: unknown = JSON.parse(text);
		if (!Array.isArray(value)) return [];
		return value.filter((item): item is string => typeof item === "string");
	} catch {
		return [];
	}
}

// #endregion FUNC_parseRefs

// #region FUNC_noteFromRow

/**
 * @purpose Build one note in one place, so each read gives the same note shape.
 * @invariants A cleared value of 0 gives false. A null column stays null. The refs field is JSON.
 */
function noteFromRow(row: Record<string, unknown>): Note {
	return {
		id: String(row.id) as Ulid,
		scope: String(row.scope) as ScopeKey,
		pos: Number(row.pos),
		state: String(row.state) as NoteState,
		cleared: Number(row.cleared) !== 0,
		kind: String(row.kind) as NoteKind,
		body: String(row.body),
		longform: nullable(row.longform),
		refs: parseRefs(row.refs),
		superseded_by: nullable(row.superseded_by) as Ulid | null,
		ts: String(row.ts),
		created_at: String(row.created_at),
		modified_at: String(row.modified_at),
		review_at: nullable(row.review_at),
		reviewed_at: nullable(row.reviewed_at),
		session: String(row.session),
		turn: String(row.turn),
		preset: String(row.preset),
		v: String(row.v),
		v_content: String(row.v_content),
		v_review: nullable(row.v_review),
	};
}

// #endregion FUNC_noteFromRow

// #region FUNC_nodeFromRow

/**
 * @purpose Build one node in one place, so the slice reads one node shape.
 * @invariants The two half keys stay null when the half holds no live note.
 */
function nodeFromRow(row: Record<string, unknown>): Node {
	return {
		scope: String(row.scope) as ScopeKey,
		level: Number(row.level),
		start: Number(row.start),
		summary: String(row.summary),
		ts_from: String(row.ts_from),
		ts_to: String(row.ts_to),
		built_v: String(row.built_v),
		a_key: nullable(row.a_key),
		b_key: nullable(row.b_key),
	};
}

// #endregion FUNC_nodeFromRow
