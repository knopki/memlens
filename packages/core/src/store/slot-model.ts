/**
 * #region moduleContract
 * @modulecontract
 * @purpose Give one import the final slot of each note without one SQL tail shift per row.
 * @scope The in-memory replay of the slot events of one scope: the rank lookup, the tail shift,
 *  the key change, and the removal.
 *  NOT: the SQL slot write, the single-note write path, and the merge channels.
 * @invariants The replay applies each event of one import in key order, so it gives each slot that
 *  the row-by-row SQL write gives.
 * @invariants One entry holds one note row of the scope, in any state, at its current key and slot.
 * @dependencies USES API: node:sqlite
 * @keywords slot, model, replay, import, rank, shift, key, scope
 * #endregion moduleContract
 */

import type { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import type { ScopeKey } from "../types/primitives.js";

const debug = debuglog("memlens:slots");

/** One note row of the scope in the model. */
interface SlotEntry {
	/** The note id. One id holds one entry of one scope. */
	readonly id: string;

	/** The creation time that sets the rank of the note. */
	ts: string;

	/** The current slot of the note. */
	pos: number;

	/** The slot of the note at load time. */
	readonly origin: number;

	/** True when the import inserts the note, so the model holds no stored row. */
	readonly fresh: boolean;
}

/** The final slot of one stored note that moved during the replay. */
export interface SlotShift {
	readonly id: string;
	readonly pos: number;
}

// #region CLASS_ScopeSlots
/**
 * @purpose Replay the slot events of one scope in memory, so one import opens each slot without a
 * SQL tail shift per row.
 * @invariants The replay of one import gives each slot that the row-by-row SQL write gives, when
 * the caller applies each event in key order.
 * @invariants A vacated slot stays empty, and the rank lookup never reuses a slot below the tail.
 */
export class ScopeSlots {
	private readonly entries: SlotEntry[] = [];
	private readonly byId = new Map<string, SlotEntry>();

	// #region METHOD_read
	/**
	 * @purpose Load each note row of one scope into one model.
	 * @invariants The load reads each state, so a hidden or deleted note keeps its slot.
	 */
	static read(db: DatabaseSync, scope: ScopeKey): ScopeSlots {
		const model = new ScopeSlots();
		const rows = db
			.prepare("SELECT id, ts, pos FROM notes WHERE scope = ?")
			.all(scope);
		for (const row of rows) {
			const pos = Number(row.pos);
			const entry: SlotEntry = {
				id: String(row.id),
				ts: String(row.ts),
				pos,
				origin: pos,
				fresh: false,
			};
			model.entries.push(entry);
			model.byId.set(entry.id, entry);
		}
		debug("Slot model load", { event: "model_load", scope, rows: rows.length });
		return model;
	}
	// #endregion METHOD_read

	// #region METHOD_rankFor
	/**
	 * @purpose Give the slot after the preceding key, as the SQL rank lookup gives it.
	 * @invariants A gap before the preceding key stays empty.
	 */
	rankFor(ts: string, id: string): number {
		let rank = 0;
		for (const entry of this.entries) {
			if (keyBefore(entry, ts, id) && entry.pos + 1 > rank)
				rank = entry.pos + 1;
		}
		return rank;
	}
	// #endregion METHOD_rankFor

	// #region METHOD_openSlot
	/**
	 * @purpose Insert one new key at its rank and move each later slot one place up.
	 * @invariants A newest key shifts nothing. An older key lands between its neighbors.
	 * @returns The open slot of the new note.
	 */
	openSlot(ts: string, id: string): number {
		const rank = this.rankFor(ts, id);
		for (const entry of this.entries) if (entry.pos >= rank) entry.pos += 1;
		const entry: SlotEntry = {
			id,
			ts,
			pos: rank,
			origin: rank,
			fresh: true,
		};
		this.entries.push(entry);
		this.byId.set(id, entry);
		debug("Slot model insert", { event: "model_insert", slot: rank });
		return rank;
	}
	// #endregion METHOD_openSlot

	// #region METHOD_remove
	/**
	 * @purpose Take one note out of the model, and leave its slot empty.
	 * @requires The model holds the note.
	 * @returns The entry with its slot at the time of the removal.
	 */
	remove(id: string): SlotEntry {
		const entry = this.byId.get(id);
		if (entry === undefined)
			throw new Error(`The slot model holds no note ${id}.`);
		this.byId.delete(id);
		this.entries.splice(this.entries.indexOf(entry), 1);
		debug("Slot model remove", { event: "model_remove", slot: entry.pos });
		return entry;
	}
	// #endregion METHOD_remove

	// #region METHOD_rekey
	/**
	 * @purpose Move one note to a new key. The note keeps its slot while no other note lies between
	 *  the two keys.
	 * @invariants A note that passes another note takes the rank of its new key, and each later slot
	 *  moves one place up, as the SQL rank lookup gives.
	 * @requires The model holds the note.
	 * @returns The old slot and the new slot when the note moved, or null when it kept its slot.
	 */
	rekey(
		id: string,
		ts: string,
	): { readonly from: number; readonly to: number } | null {
		const entry = this.byId.get(id);
		if (entry === undefined)
			throw new Error(`The slot model holds no note ${id}.`);
		const passed = this.entries.some(
			(other) =>
				other !== entry &&
				keyBefore(other, ts, id) !== keyBefore(other, entry.ts, id),
		);
		if (!passed) {
			entry.ts = ts;
			debug("Slot model rekey", { event: "model_rekey", slot: entry.pos });
			return null;
		}
		const from = entry.pos;
		const rank = this.rankFor(ts, id);
		for (const other of this.entries) if (other.pos >= rank) other.pos += 1;
		entry.pos = rank;
		entry.ts = ts;
		debug("Slot model rekey", { event: "model_rekey", slot: rank, from });
		return { from, to: rank };
	}
	// #endregion METHOD_rekey

	// #region METHOD_posOf
	/** @purpose Give the current slot of one note, or null when the model holds no such note. */
	posOf(id: string): number | null {
		return this.byId.get(id)?.pos ?? null;
	}
	// #endregion METHOD_posOf

	// #region METHOD_shifted
	/**
	 * @purpose List each stored note of the scope whose slot changed during the replay.
	 * @invariants The list holds no note that the import inserts, and no note that a move takes out.
	 */
	shifted(): SlotShift[] {
		return this.entries
			.filter((entry) => !entry.fresh && entry.pos !== entry.origin)
			.map((entry) => ({ id: entry.id, pos: entry.pos }));
	}
	// #endregion METHOD_shifted

	// #region METHOD_maxPos
	/** @purpose Give the greatest slot in the model, or -1 when the model holds no note. */
	maxPos(): number {
		let max = -1;
		for (const entry of this.entries) if (entry.pos > max) max = entry.pos;
		return max;
	}
	// #endregion METHOD_maxPos
}
// #endregion CLASS_ScopeSlots

// #region FUNC_keyBefore
/** @purpose Report whether one entry key sorts before one search key, as the SQL comparison does. */
function keyBefore(entry: SlotEntry, ts: string, id: string): boolean {
	return entry.ts < ts || (entry.ts === ts && entry.id < id);
}
// #endregion FUNC_keyBefore
