/**
 * #region moduleContract
 * @modulecontract
 * @purpose Answer each memory read from the rows of one store, so no read scans the log.
 * @scope Note targets and supersede links, due reviews, live counts, scope notes, nodes, the directions data,
 *   and the journal rows.
 * @invariants The note reads give a row in any state. A hidden row is evidence, not content loss.
 * @invariants Each read uses one statement on the store handle. No read opens a long transaction.
 * @keywords read, note, node, due, review, count, scope, directions, journal, rest
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { IsoTime, ScopeKey, Ulid } from "../types/primitives.js";
import { NOTE_COLUMNS, nodeFromRow, noteFromRow } from "./rows.js";
import type { Store } from "./store.js";
import type { Node, Note } from "./types.js";

const debug = debuglog("memlens:reads");

// #region INTERFACE_DirectionLine
/**
 * @purpose Give the caller one scope line of the directions block.
 * @invariants The summary stays null until the caller joins the top node line.
 */
export interface DirectionLine {
	/** The scope of the line. */
	readonly scope: ScopeKey;

	/** The `ts` of the newest live note of the scope. */
	readonly newestTs: IsoTime;

	/** The top node line. The caller joins it after this read. */
	readonly summary: string | null;
}
// #endregion INTERFACE_DirectionLine

// #region INTERFACE_DirectionsData
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
// #endregion INTERFACE_DirectionsData

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

// #region FUNC_supersedesOf
/** @purpose Read the ids of the notes that one note replaced, in id order. */
export function supersedesOf(store: Store, id: Ulid): readonly Ulid[] {
	const rows = store
		.handle()
		.prepare("SELECT id FROM notes WHERE superseded_by = ? ORDER BY id")
		.all(id);
	debug("Supersede links read", { id, targets: rows.length });
	return rows.map((row) => String(row.id));
}
// #endregion FUNC_supersedesOf

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
 * @invariants The lines are the budget newest scopes, from the oldest to the newest. A scope ranks
 *   by the `ts` of its newest live note.
 * @invariants The rest list holds each older scope, from the newest to the oldest.
 * @invariants The summary is null, because the caller joins the top node line later.
 */
export function directionsData(
	store: Store,
	profileScopes: readonly ScopeKey[],
	budget: number,
): DirectionsData {
	const cap = Math.max(0, budget);
	const scopes = [...new Set(profileScopes)];
	const newest = newestTimes(store, scopes);
	const lines = newest
		.slice(0, cap)
		.reverse()
		.map((mark) => ({ ...mark, summary: null }));
	const rest = newest.slice(cap).map((mark) => mark.scope);
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

// #region FUNC_newestTimes
/**
 * @purpose Give the `ts` of the newest live note of each scope, so a reader knows how fresh the
 *   records of a scope are.
 * @invariants A scope with no live note gives no entry. The newest time comes first, and an equal
 *   time orders by the scope key.
 * @invariants Only the live notes set the rank, so a move or a review of a note moves no scope.
 */
function newestTimes(
	store: Store,
	profileScopes: readonly ScopeKey[],
): readonly { readonly scope: ScopeKey; readonly newestTs: string }[] {
	const scopes = [...new Set(profileScopes)];
	if (scopes.length === 0) return [];
	const marks = scopes.map(() => "?").join(", ");
	const rows = store
		.handle()
		.prepare(
			`SELECT scope, MAX(ts) AS newest_ts FROM notes
			WHERE state = 'live' AND scope IN (${marks})
			GROUP BY scope`,
		)
		.all(...scopes);
	return rows
		.map((row) => ({
			scope: String(row.scope) as ScopeKey,
			newestTs: String(row.newest_ts),
		}))
		.sort(newerFirst);
}
// #endregion FUNC_newestTimes

// #region INTERFACE_JournalRow
/**
 * @purpose Give the caller one journal event of the audit trail.
 */
export interface JournalRow {
	/** The sequence number of the event. */
	readonly seq: number;

	/** The wall clock of the event. */
	readonly at: IsoTime;

	/** The operation name of the event. */
	readonly op: string;

	/** The note id of the target, or null when the event names no note. */
	readonly target: Ulid | null;

	/** The scope key of the target, or null when the event names no scope. */
	readonly scope: ScopeKey | null;

	/** The reason text, or null when the writer gave none. */
	readonly reason: string | null;
}
// #endregion INTERFACE_JournalRow

// #region FUNC_journalRows
/**
 * @purpose List the newest journal events, so a user reads the audit trail of the store.
 * @invariants The answer runs from the oldest event of the set to the newest. The read holds no
 *   content of a note.
 * @returns The newest events, at most the given limit.
 */
export function journalRows(
	store: Store,
	options: { limit: number; scope?: ScopeKey },
): readonly JournalRow[] {
	const cap = Math.max(0, options.limit);
	const rows = options.scope
		? store
				.handle()
				.prepare(
					"SELECT seq, at, op, target, scope, reason FROM journal WHERE scope = ? ORDER BY seq DESC LIMIT ?",
				)
				.all(options.scope, cap)
		: store
				.handle()
				.prepare(
					"SELECT seq, at, op, target, scope, reason FROM journal ORDER BY seq DESC LIMIT ?",
				)
				.all(cap);
	debug("Journal rows", {
		event: "journal_rows",
		count: rows.length,
		limit: cap,
		scope: options.scope ?? null,
	});
	return rows
		.map((row) => ({
			seq: Number(row.seq),
			at: String(row.at) as IsoTime,
			op: String(row.op),
			target: row.target === null ? null : (String(row.target) as Ulid),
			scope: row.scope === null ? null : (String(row.scope) as ScopeKey),
			reason: row.reason === null ? null : String(row.reason),
		}))
		.reverse();
}
// #endregion FUNC_journalRows

// #region FUNC_newestScope
/**
 * @purpose Give the scope of the newest live note among a set, so the console opens on the scope of
 * the newest record.
 * @invariants A set with no live note gives null.
 */
export function newestScope(
	store: Store,
	scopes: readonly ScopeKey[],
): ScopeKey | null {
	const scope = newestTimes(store, scopes)[0]?.scope ?? null;
	debug("Newest scope", {
		event: "newest_scope",
		scope,
		scopes: scopes.length,
	});
	return scope;
}
// #endregion FUNC_newestScope

function newerFirst(
	a: { readonly newestTs: string; readonly scope: ScopeKey },
	b: { readonly newestTs: string; readonly scope: ScopeKey },
): number {
	if (a.newestTs !== b.newestTs) return a.newestTs < b.newestTs ? 1 : -1;
	return a.scope < b.scope ? -1 : a.scope === b.scope ? 0 : 1;
}
