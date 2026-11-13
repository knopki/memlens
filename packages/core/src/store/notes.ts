/**
 * #region moduleContract
 * @purpose Give each note write one transaction, so the row, the index, the nodes, and the journal change together.
 * @scope The note, amend, hide, redact, and review operations of the SQLite store. NOT: reads, imports, proposals, and compaction.
 * @invariants One publish call owns one transaction. A refused duplicate returns before the write transaction.
 * @invariants The index changes before the content row, because the external-content table needs the old values.
 * @invariants A write that changes a covered slot deletes each node over that slot and over the moved tail.
 * @invariants A redact runs the truncating checkpoint after the commit.
 * @dependencies node:sqlite, store/store.ts, store/slots.ts, store/nodes.ts, domain/note-body.ts, domain/ulid.ts, domain/scope.ts, types/errors.ts.
 * @keywords note, amend, hide, redact, review, fts, journal, slot, supersede
 * #endregion moduleContract
 */

import type { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import { normalizeBody, splitBody } from "../domain/note-body.js";
import { normalizeScopeKey, validateScopeKey } from "../domain/scope.js";
import { ulid } from "../domain/ulid.js";
import { MemlensError } from "../types/errors.js";
import type { NoteKind, ScopeKey, Ulid } from "../types/events.js";
import { deleteCovering, deleteRange } from "./nodes.js";
import { nextSlot, rankFor } from "./slots.js";
import type { Store, Tx } from "./store.js";
import type { Note, NoteState, WriteResult } from "./types.js";

const debug = debuglog("memlens:notes");

/** The columns of one note row, in the shape of the table. */
interface RawNote {
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
interface FtsRow {
	readonly body: string;
	readonly longform: string | null;
	readonly state: NoteState;
	readonly cleared: number;
}

const COLUMNS =
	"n, id, scope, pos, state, cleared, kind, body, longform, refs, superseded_by, ts, created_at, modified_at, review_at, reviewed_at, session, turn, preset, v, v_content, v_review";
const SELECT_ROW = `SELECT ${COLUMNS} FROM notes WHERE id = ?`;
const SELECT_DUPLICATE =
	"SELECT id FROM notes WHERE scope = ? AND body = ? AND state = 'live' AND kind = ? AND longform IS ? AND review_at IS ? LIMIT 1";
const INSERT_ROW = `INSERT INTO notes (id, scope, pos, state, cleared, kind, body, longform, refs, superseded_by, ts, created_at, modified_at, review_at, reviewed_at, session, turn, preset, v, v_content, v_review) VALUES (?, ?, ?, 'live', 0, ?, ?, ?, ?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL)`;

// #region INTERFACE_NoteInput

/**
 * @purpose Name the fields of one new note, so the caller supplies one complete write.
 * @invariants The ts field defaults to the write time. The supersedes field skips the duplicate check.
 */
export interface NoteInput {
	readonly id?: Ulid;
	readonly scope: ScopeKey;
	readonly kind: NoteKind;
	readonly body: string;
	readonly longform?: string | null;
	readonly refs?: readonly string[];
	readonly review_at?: string | null;
	readonly session: string;
	readonly turn: string;
	readonly preset: string;
	readonly ts?: string;
	readonly supersedes?: readonly Ulid[];
}

// #endregion INTERFACE_NoteInput

// #region INTERFACE_AmendInput

/**
 * @purpose Name the fields of one amendment, so an absent field keeps its stored value.
 * @invariants A present scope field moves the row to its rank in the destination scope.
 */
export interface AmendInput {
	readonly id: Ulid;
	readonly body?: string;
	readonly longform?: string | null;
	readonly kind?: NoteKind;
	readonly scope?: ScopeKey;
}

// #endregion INTERFACE_AmendInput

// #region FUNC_note

/**
 * @purpose Add one note at its key rank, or name an existing live note as the duplicate.
 * @invariants A duplicate writes no note row and does not tick the clock.
 * @invariants Each supersede target exists in the same scope, and each target becomes hidden.
 * @returns The new note, or the duplicate reason.
 */
export function note(store: Store, input: NoteInput): WriteResult<Note> {
	const scope = checkedScope(input.scope);
	const split = splitForWrite(input.body, input.longform ?? null);
	const reviewAt = input.review_at ?? null;
	const supersedes = input.supersedes ?? [];
	if (supersedes.length === 0) {
		const duplicate = store.read((db) =>
			findDuplicate(
				db,
				scope,
				split.body,
				input.kind,
				split.longform,
				reviewAt,
			),
		);
		if (duplicate) {
			debug("Note duplicate", { event: "duplicate", scope, kind: input.kind });
			return { ok: false, reason: "duplicate" };
		}
	}
	return { ok: true, value: store.publish((tx) => noteTx(tx, input)).value };
}

// #endregion FUNC_note

// #region FUNC_noteTx

/**
 * @purpose Add a note within the caller transaction.
 * @invariants The caller checks for duplicates before this call.
 */
export function noteTx(tx: Tx, input: NoteInput): Note {
	const scope = checkedScope(input.scope);
	const split = splitForWrite(input.body, input.longform ?? null);
	const body = split.body;
	const longform = split.longform;
	const reviewAt = input.review_at ?? null;
	const supersedes = input.supersedes ?? [];
	const ts = input.ts ?? new Date().toISOString();
	const id = input.id ?? ulid(Date.now());
	const now = new Date().toISOString();
	if (rowById(tx.db, id) !== undefined)
		throw new MemlensError("Data", "A note id already exists.");
	const targets = supersedes.map((target) => {
		const row = rowById(tx.db, target);
		if (row === undefined)
			throw new MemlensError("Data", "A local target does not exist.");
		if (row.scope !== scope)
			throw new MemlensError(
				"CrossScopeSupersede",
				"A supersede target belongs to another scope.",
			);
		return row;
	});
	const pos = openSlot(tx.db, scope, ts, id);
	tx.db
		.prepare(INSERT_ROW)
		.run(
			id,
			scope,
			pos,
			input.kind,
			body,
			longform,
			JSON.stringify(input.refs ?? []),
			ts,
			now,
			now,
			reviewAt,
			input.session,
			input.turn,
			input.preset,
			tx.version,
			tx.version,
		);
	const row = requireRow(tx.db, id);
	ftsSet(tx.db, row.n, null, ftsRowOf(row));
	deleteShifted(tx.db, scope, pos);
	for (const target of targets) {
		ftsSet(tx.db, target.n, ftsRowOf(target), null);
		tx.db
			.prepare(
				"UPDATE notes SET state = 'hidden', superseded_by = ?, v = ?, modified_at = ? WHERE id = ?",
			)
			.run(id, tx.version, now, target.id);
		deleteCovering(tx.db, target.scope, target.pos);
		tx.journal("supersede", target.id, target.scope);
	}
	tx.journal("note", id, scope);
	debug("Note write", {
		event: "note",
		id,
		scope,
		slot: pos,
		supersedes: targets.length,
	});
	return toNote(row);
}

// #endregion FUNC_noteTx

// #region FUNC_noteCheckedTx

/**
 * @purpose Apply one note write with ordinary duplicate rules inside a caller transaction.
 * @invariants A duplicate writes no note row, so a proposal approval that repeats a live note closes with no record.
 */
export function noteCheckedTx(tx: Tx, input: NoteInput): WriteResult<Note> {
	const scope = checkedScope(input.scope);
	const split = splitForWrite(input.body, input.longform ?? null);
	if (
		findDuplicate(
			tx.db,
			scope,
			split.body,
			input.kind,
			split.longform,
			input.review_at ?? null,
		)
	)
		return { ok: false, reason: "duplicate" };
	return { ok: true, value: noteTx(tx, input) };
}

// #endregion FUNC_noteCheckedTx

// #region FUNC_linkSupersedes

/**
 * @purpose Stamp the supersede latch on targets of one source, as one publication.
 * @invariants Each target hides, takes the source id as its first link, and leaves the index and its covering nodes.
 * @invariants A target of another scope or a cleared target refuses the write. An already linked target stays untouched.
 */
export function linkSupersedes(
	store: Store,
	id: string,
	targets: readonly string[],
): void {
	store.publish((tx) => {
		const source = requireRow(tx.db, id);
		const now = new Date().toISOString();
		for (const target of targets) {
			const row = requireRow(tx.db, target);
			if (row.scope !== source.scope)
				throw new MemlensError(
					"CrossScopeSupersede",
					"A supersede target belongs to another scope.",
				);
			if (row.cleared === 1)
				throw new MemlensError("Data", "A cleared note cannot change.");
			if (row.superseded_by !== null) continue;
			ftsSet(tx.db, row.n, ftsRowOf(row), null);
			tx.db
				.prepare(
					"UPDATE notes SET state = 'hidden', superseded_by = ?, v = ?, modified_at = ? WHERE id = ?",
				)
				.run(id, tx.version, now, target);
			deleteCovering(tx.db, row.scope, row.pos);
			tx.journal("supersede", target, row.scope);
		}
		tx.journal("supersede", id, source.scope);
	});
}

// #endregion FUNC_linkSupersedes

// #region FUNC_amend

/**
 * @purpose Change the content group of one note, and move the note to its rank when the scope changes.
 * @invariants An absent field keeps its stored value. A cleared note refuses the change.
 * @invariants The old slot and each moved slot lose their covering nodes in the same transaction.
 * @returns The changed note.
 */
export function amend(store: Store, input: AmendInput): Note {
	return store.publish((tx) => amendTx(tx, input)).value;
}

// #endregion FUNC_amend

// #region FUNC_amendTx

/** @purpose Amend a note within the caller transaction. */
export function amendTx(tx: Tx, input: AmendInput): Note {
	const old = requireRow(tx.db, input.id);
	if (old.cleared === 1)
		throw new MemlensError("Data", "A cleared note cannot change.");
	const now = new Date().toISOString();
	const scope: ScopeKey =
		input.scope === undefined ? old.scope : checkedScope(input.scope);
	const explicitLongform = Object.hasOwn(input, "longform")
		? (input.longform ?? null)
		: old.longform;
	const split =
		input.body === undefined
			? null
			: splitForWrite(input.body, explicitLongform);
	const body = split === null ? old.body : split.body;
	const longform = split === null ? explicitLongform : split.longform;
	const kind = input.kind ?? old.kind;
	const moved = scope !== old.scope;
	ftsSet(tx.db, old.n, ftsRowOf(old), {
		body,
		longform,
		state: old.state,
		cleared: old.cleared,
	});
	let pos = old.pos;
	if (moved) {
		pos = openSlot(tx.db, scope, old.ts, old.id);
		deleteCovering(tx.db, old.scope, old.pos);
		deleteShifted(tx.db, scope, pos);
	} else {
		deleteCovering(tx.db, old.scope, old.pos);
	}
	tx.db
		.prepare(
			"UPDATE notes SET scope = ?, pos = ?, kind = ?, body = ?, longform = ?, v = ?, v_content = ?, modified_at = ? WHERE id = ?",
		)
		.run(scope, pos, kind, body, longform, tx.version, tx.version, now, old.id);
	tx.journal("amend", old.id, scope);
	debug("Note amend", { event: "amend", id: old.id, scope, moved });
	return requireNote(tx.db, old.id);
}

// #endregion FUNC_amendTx

// #region FUNC_hide

/**
 * @purpose Remove the note from the view, and keep the row as a lifecycle record.
 * @invariants A deleted or cleared row refuses the hide. The index row leaves before the state changes.
 * @returns The hidden note.
 */
export function hide(store: Store, id: Ulid, reason?: string): Note {
	return store.publish((tx) => hideTx(tx, { id, reason })).value;
}

// #endregion FUNC_hide

// #region FUNC_hideTx

/** @purpose Hide a note within the caller transaction. */
export function hideTx(
	tx: Tx,
	input: { id: Ulid; reason?: string | undefined },
): Note {
	const { id, reason } = input;
	const checked = checkedReason(reason);
	const old = requireRow(tx.db, id);
	if (old.state === "deleted" || old.cleared === 1)
		throw new MemlensError("Data", "A deleted note cannot hide.");
	const now = new Date().toISOString();
	ftsSet(tx.db, old.n, ftsRowOf(old), null);
	tx.db
		.prepare(
			"UPDATE notes SET state = 'hidden', v = ?, modified_at = ? WHERE id = ?",
		)
		.run(tx.version, now, id);
	deleteCovering(tx.db, old.scope, old.pos);
	tx.journal("hide", id, old.scope, checked);
	debug("Note hide", {
		event: "hide",
		id,
		scope: old.scope,
		hasReason: checked !== undefined,
	});
	return requireNote(tx.db, id);
}

// #endregion FUNC_hideTx

// #region FUNC_redact

/**
 * @purpose Erase the content of one note, so no copy of the text stays in the store.
 * @invariants The transaction clears the row, the index row, the covering nodes, and the proposals of the target.
 * @invariants The truncating checkpoint runs after the commit.
 * @returns The cleared note.
 */
export function redact(store: Store, id: Ulid, reason: string): Note {
	const checked = checkedReason(reason);
	const cleared = store.publish((tx) => {
		const old = requireRow(tx.db, id);
		const now = new Date().toISOString();
		ftsSet(tx.db, old.n, ftsRowOf(old), null);
		tx.db
			.prepare(
				"UPDATE notes SET state = 'deleted', cleared = 1, body = '', longform = NULL, v = ?, modified_at = ? WHERE id = ?",
			)
			.run(tx.version, now, id);
		deleteCovering(tx.db, old.scope, old.pos);
		tx.db.prepare("DELETE FROM proposals WHERE target = ?").run(id);
		tx.journal("redact", id, old.scope, checked);
		debug("Note redact", { event: "redact", id, scope: old.scope });
		return requireNote(tx.db, id);
	});
	store.truncate();
	return cleared.value;
}

// #endregion FUNC_redact

// #region FUNC_review

/**
 * @purpose Record one review of a note, and set the next review time.
 * @invariants The write changes no content, no modified_at, and no node row.
 * @returns The reviewed note.
 */
export function review(store: Store, id: Ulid, reviewAt: string | null): Note {
	return store.publish((tx) => reviewTx(tx, { id, reviewAt })).value;
}

// #endregion FUNC_review

// #region FUNC_reviewTx

/** @purpose Review a note within the caller transaction. */
export function reviewTx(
	tx: Tx,
	input: { id: Ulid; reviewAt: string | null },
): Note {
	const { id, reviewAt } = input;
	const old = requireRow(tx.db, id);
	const now = new Date().toISOString();
	tx.db
		.prepare(
			"UPDATE notes SET review_at = ?, reviewed_at = ?, v = ?, v_review = ? WHERE id = ?",
		)
		.run(reviewAt, now, tx.version, tx.version, id);
	tx.journal("review", id, old.scope);
	debug("Note review", { event: "review", id, scope: old.scope });
	return requireNote(tx.db, id);
}

// #endregion FUNC_reviewTx

// #region FUNC_ftsSet

/**
 * @purpose Keep the external-content index in step with the old and the new values of one row.
 * @invariants The delete uses the old values, because the index cannot read a changed content row.
 * @invariants The guard takes the old lifecycle flags, because a never-indexed row cannot lose an index row.
 */
function ftsSet(
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
function openSlot(
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
function deleteShifted(db: DatabaseSync, scope: ScopeKey, from: number): void {
	const to = nextSlot(db, scope);
	if (to > from) deleteRange(db, scope, from, to);
}

// #endregion FUNC_deleteShifted

// #region FUNC_toNote

/**
 * @purpose Turn one note row into the public note shape.
 * @invariants The refs text becomes an array of strings. A broken text gives an empty array.
 */
function toNote(row: RawNote): Note {
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

/** @purpose Read the refs text of a note row as an array of strings. */
function parseRefs(value: string): readonly string[] {
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((item): item is string => typeof item === "string");
	} catch {
		return [];
	}
}

/** @purpose Read one row by its id, or undefined when the store holds no such row. */
function rowById(db: DatabaseSync, id: string): RawNote | undefined {
	const row = db.prepare(SELECT_ROW).get(id);
	return row === undefined ? undefined : (row as unknown as RawNote);
}

/** @purpose Read one row by its id, or refuse the write when the row is absent. */
function requireRow(db: DatabaseSync, id: string): RawNote {
	const row = rowById(db, id);
	if (row === undefined)
		throw new MemlensError("Data", "A local target does not exist.");
	return row;
}

/** @purpose Read one note by its id, or refuse the call when the row is absent. */
function requireNote(db: DatabaseSync, id: string): Note {
	return toNote(requireRow(db, id));
}

/** @purpose Name the index values of one stored note row. */
function ftsRowOf(row: RawNote): FtsRow {
	return {
		body: row.body,
		longform: row.longform,
		state: row.state,
		cleared: row.cleared,
	};
}

/** @purpose Report whether a live note with the same comparison fields exists. */
function findDuplicate(
	db: DatabaseSync,
	scope: ScopeKey,
	body: string,
	kind: NoteKind,
	longform: string | null,
	reviewAt: string | null,
): boolean {
	return (
		db.prepare(SELECT_DUPLICATE).get(scope, body, kind, longform, reviewAt) !==
		undefined
	);
}

/** @purpose Normalize one scope key, or refuse the write when the key is not valid. */
function checkedScope(raw: string): ScopeKey {
	const scope = normalizeScopeKey(raw);
	if (!validateScopeKey(scope))
		throw new MemlensError("Data", "The scope key is not valid.");
	return scope;
}

/** @purpose Normalize one body and move its overflow into the longform. */
function splitForWrite(
	raw: string,
	existing: string | null,
): {
	body: string;
	longform: string | null;
} {
	return splitBody(normalizeBody(raw), existing);
}

/** @purpose Keep a journal reason within its limit, or refuse the write. */
function checkedReason(reason: string | undefined): string | undefined {
	if (reason === undefined) return undefined;
	if (reason.length > 200)
		throw new MemlensError("Data", "The reason exceeds 200 characters.");
	return reason;
}
