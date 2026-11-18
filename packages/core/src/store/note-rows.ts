/**
 * #region moduleContract
 * @modulecontract
 * @purpose Read and change the stored note row, so each note write keeps the row and the index in step.
 * @scope The row shape, the index row, the slot open, the row read, the duplicate test, and the body limits.
 *  NOT: the operations, the transactions, the journal, and the nodes.
 * @dependencies USES API: node:sqlite
 * @keywords note, row, slot, fts, index, refs, duplicate, body
 * #endregion moduleContract
 */

import type { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import { normalizeBody, splitBody } from "../domain/note-body.js";
import { normalizeScopeKey, validateScopeKey } from "../domain/scope.js";
import { MemlensError } from "../types/errors.js";
import type { NoteKind, ScopeKey } from "../types/primitives.js";
import { deleteRange } from "./nodes.js";
import { parseRefs } from "./rows.js";
import { nextSlot, rankFor } from "./slots.js";
import type { Note, NoteState } from "./types.js";

const debug = debuglog("memlens:notes");

/** The columns of one note row, in the shape of the table. */
export interface RawNote {
	readonly n: number;
	readonly id: string;
	readonly scope: ScopeKey;
	readonly pos: number;
	readonly state: NoteState;
	readonly cleared: number;
	readonly kind: NoteKind;
	readonly body: string;
	readonly longform: string | null;
	readonly refs: string;
	readonly superseded_by: string | null;
	readonly ts: string;
	readonly created_at: string;
	readonly modified_at: string;
	readonly review_at: string | null;
	readonly reviewed_at: string | null;
	readonly session: string;
	readonly turn: string;
	readonly preset: string;
	readonly v: string;
	readonly v_content: string;
	readonly v_review: string | null;
}

/** The fields of the index row, with the lifecycle flags that guard a delete. */
export interface FtsRow {
	readonly body: string;
	readonly longform: string | null;
	readonly state: NoteState;
	readonly cleared: number;
}

const COLUMNS =
	"n, id, scope, pos, state, cleared, kind, body, longform, refs, superseded_by, ts, created_at, modified_at, review_at, reviewed_at, session, turn, preset, v, v_content, v_review";

const SELECT_ROW = `SELECT ${COLUMNS} FROM notes WHERE id = ?`;

const SELECT_DUPLICATE = `SELECT ${COLUMNS} FROM notes WHERE scope = ? AND body = ? AND state = 'live' AND kind = ? AND longform IS ? AND review_at IS ? LIMIT 1`;

export const INSERT_ROW = `INSERT INTO notes (id, scope, pos, state, cleared, kind, body, longform, refs, superseded_by, ts, created_at, modified_at, review_at, reviewed_at, session, turn, preset, v, v_content, v_review) VALUES (?, ?, ?, 'live', 0, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL)`;

// #region FUNC_ftsSet
/**
 * @purpose Keep the external-content index in step with the old and the new values of one row.
 * @invariants The delete uses the old values, because the index cannot read a changed content row.
 * @invariants The guard takes the old lifecycle flags, because a never-indexed row cannot lose an index row.
 */
export function ftsSet(
	db: DatabaseSync,
	n: number,
	oldRow: FtsRow | null,
	newRow: FtsRow | null,
): void {
	if (oldRow !== null && oldRow.state === "live" && oldRow.cleared === 0) {
		db.prepare(
			"INSERT INTO fts(fts, rowid, body, longform) VALUES ('delete', ?, ?, ?)",
		).run(n, oldRow.body, oldRow.longform ?? "");
		debug("Index delete", { event: "fts_delete", row: n });
	}
	if (newRow !== null && newRow.state === "live" && newRow.cleared === 0) {
		db.prepare("INSERT INTO fts(rowid, body, longform) VALUES (?, ?, ?)").run(
			n,
			newRow.body,
			newRow.longform,
		);
		debug("Index insert", { event: "fts_insert", row: n });
	}
}
// #endregion FUNC_ftsSet

// #region FUNC_openSlot
/**
 * @purpose Open the rank slot of one key, and move each later slot one place up.
 * @invariants Two statements pass the moved tail through a negative band, so no pair of slots clashes.
 * @requires The caller runs the statements inside the write transaction.
 * @returns The free slot of the key.
 */
export function openSlot(
	db: DatabaseSync,
	scope: ScopeKey,
	ts: string,
	id: string,
): number {
	const pos = rankFor(db, scope, ts, id);
	db.prepare(
		"UPDATE notes SET pos = -pos - 1 WHERE scope = ? AND pos >= ?",
	).run(scope, pos);
	db.prepare("UPDATE notes SET pos = -pos WHERE scope = ? AND pos < 0").run(
		scope,
	);
	debug("Slot open", { event: "slot_open", slot: pos });
	return pos;
}
// #endregion FUNC_openSlot

// #region FUNC_deleteShifted
/**
 * @purpose Delete each node over a changed slot and over the tail that moved with it.
 * @invariants The range runs from the changed slot to the slot above the tail.
 */
export function deleteShifted(
	db: DatabaseSync,
	scope: ScopeKey,
	from: number,
): void {
	const to = nextSlot(db, scope);
	if (to > from) deleteRange(db, scope, from, to);
}
// #endregion FUNC_deleteShifted

// #region FUNC_toNote
/**
 * @purpose Turn one note row into the public note shape.
 * @invariants The refs text becomes an array of strings. A broken text gives an empty array.
 */
export function toNote(row: RawNote): Note {
	return {
		id: row.id,
		scope: row.scope as ScopeKey,
		pos: row.pos,
		state: row.state,
		cleared: row.cleared === 1,
		kind: row.kind,
		body: row.body,
		longform: row.longform,
		refs: parseRefs(row.refs),
		superseded_by: row.superseded_by,
		ts: row.ts,
		created_at: row.created_at,
		modified_at: row.modified_at,
		review_at: row.review_at,
		reviewed_at: row.reviewed_at,
		session: row.session,
		turn: row.turn,
		preset: row.preset,
		v: row.v,
		v_content: row.v_content,
		v_review: row.v_review,
	};
}
// #endregion FUNC_toNote

/** @purpose Read one row by its id, or undefined when the store holds no such row. */
export function rowById(db: DatabaseSync, id: string): RawNote | undefined {
	const row = db.prepare(SELECT_ROW).get(id);
	return row === undefined ? undefined : (row as unknown as RawNote);
}

/** @purpose Read one row by its id, or refuse the write when the row is absent. */
export function requireRow(db: DatabaseSync, id: string): RawNote {
	const row = rowById(db, id);
	if (row === undefined)
		throw new MemlensError("Data", "A local target does not exist.");
	return row;
}

/** @purpose Read one note by its id, or refuse the call when the row is absent. */
export function requireNote(db: DatabaseSync, id: string): Note {
	return toNote(requireRow(db, id));
}

/** @purpose Name the index values of one stored note row. */
export function ftsRowOf(row: RawNote): FtsRow {
	return {
		body: row.body,
		longform: row.longform,
		state: row.state,
		cleared: row.cleared,
	};
}

/** @purpose Give the live note with the same comparison fields, so a caller can answer with it. */
export function findDuplicate(
	db: DatabaseSync,
	scope: ScopeKey,
	body: string,
	kind: NoteKind,
	longform: string | null,
	reviewAt: string | null,
): RawNote | undefined {
	return db
		.prepare(SELECT_DUPLICATE)
		.get(scope, body, kind, longform, reviewAt) as RawNote | undefined;
}

/** @purpose Normalize one scope key, or refuse the write when the key is not valid. */
export function checkedScope(raw: string): ScopeKey {
	const scope = normalizeScopeKey(raw);
	if (!validateScopeKey(scope))
		throw new MemlensError("Data", "The scope key is not valid.");
	return scope;
}

/** @purpose Normalize one body and move its overflow into the longform. */
export function splitForWrite(
	raw: string,
	existing: string | null,
): {
	body: string;
	longform: string | null;
} {
	return splitBody(normalizeBody(raw), existing);
}

/** @purpose Keep a journal reason within its limit, or refuse the write. */
export function checkedReason(reason: string | undefined): string | undefined {
	if (reason === undefined) return undefined;
	if (reason.length > 200)
		throw new MemlensError("Data", "The reason exceeds 200 characters.");
	return reason;
}
