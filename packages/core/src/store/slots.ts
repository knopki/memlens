/**
 * #region moduleContract
 * @modulecontract
 * @purpose Place each note at its rank in the immutable `(ts, id)` order of its scope.
 * @scope Slot lookup, rank computation, and the tail shift of an insert into the middle.
 * @invariants A slot is the rank of the note over all note rows of the scope, in any state.
 * @invariants An insert into the middle shifts each later slot by one in the same transaction.
 * @invariants A vacated slot stays empty until a later note takes the tail again.
 * @dependencies node:sqlite only.
 * @keywords slot, rank, order, shift, position, tail
 * #endregion moduleContract
 */

import type { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import type { ScopeKey } from "../types/primitives.js";

const debug = debuglog("memlens:slots");

// #region FUNC_nextSlot
/**
 * @purpose Give the next free tail slot of a scope.
 * @invariants The value is one above the greatest slot in use, so a vacated tail slot is reused.
 */
export function nextSlot(db: DatabaseSync, scope: ScopeKey): number {
	const row = db
		.prepare(
			"SELECT COALESCE(MAX(pos) + 1, 0) AS next FROM notes WHERE scope = ?",
		)
		.get(scope);
	const next = Number(row?.next ?? 0);
	debug("Slot next", { event: "next", slot: next });
	return next;
}
// #endregion FUNC_nextSlot

// #region FUNC_rankFor
/**
 * @purpose Count the rows of a scope that order before one key.
 * @invariants The count covers each state, because each row holds its slot.
 */
export function rankFor(
	db: DatabaseSync,
	scope: ScopeKey,
	ts: string,
	id: string,
): number {
	const row = db
		.prepare(
			"SELECT COUNT(*) AS rank FROM notes WHERE scope = ? AND (ts < ? OR (ts = ? AND id < ?))",
		)
		.get(scope, ts, ts, id);
	return Number(row?.rank ?? 0);
}
// #endregion FUNC_rankFor

// #region FUNC_shiftFrom
/**
 * @purpose Move each row of a scope at or above one slot one slot higher.
 * @invariants The shift runs as one negative band, so no row meets the slot of another row on the way.
 * @returns The count of moved rows.
 */
function shiftFrom(db: DatabaseSync, scope: ScopeKey, from: number): number {
	db.prepare(
		"UPDATE notes SET pos = -pos - 1 WHERE scope = ? AND pos >= ?",
	).run(scope, from);
	const result = db
		.prepare("UPDATE notes SET pos = -pos WHERE scope = ? AND pos < 0")
		.run(scope);
	debug("Slot shift", { event: "shift", from, moved: result.changes });
	return Number(result.changes);
}
// #endregion FUNC_shiftFrom

// #region FUNC_insertSlot
/**
 * @purpose Compute the slot of a new key and open it with one tail shift.
 * @invariants A newest key shifts nothing. An older key lands between its neighbors.
 * @returns The open slot of the new note.
 */
export function insertSlot(
	db: DatabaseSync,
	scope: ScopeKey,
	ts: string,
	id: string,
): number {
	const rank = rankFor(db, scope, ts, id);
	shiftFrom(db, scope, rank);
	debug("Slot insert", { event: "insert", slot: rank });
	return rank;
}
// #endregion FUNC_insertSlot
