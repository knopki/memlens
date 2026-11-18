/**
 * #region moduleContract
 * @modulecontract
 * @purpose Give each note write one transaction, so the row, the index, the nodes, and the journal change together.
 * @scope The note, amend, hide, redact, and review operations of the SQLite store.
 *  NOT: the row helpers, the reads, the imports, the proposals, and the compaction.
 * @invariants One publish call owns one transaction.
 * @invariants The index changes before the content row, because the external-content table needs the old values.
 * @invariants A write that changes a covered slot deletes each node over that slot and over the moved tail.
 * @dependencies USES API: node:sqlite
 * @keywords note, amend, hide, redact, review, fts, journal, slot, supersede
 * #endregion moduleContract
 */

import type { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import { ulid } from "../domain/ulid.js";
import { MemlensError } from "../types/errors.js";
import type { NoteKind, ScopeKey, Ulid } from "../types/primitives.js";
import { deleteCovering } from "./nodes.js";
import {
	checkedReason,
	checkedScope,
	deleteShifted,
	findDuplicate,
	ftsRowOf,
	ftsSet,
	INSERT_ROW,
	openSlot,
	type RawNote,
	requireNote,
	requireRow,
	rowById,
	splitForWrite,
	toNote,
} from "./note-rows.js";
import type { Store, Tx } from "./store.js";
import type { Note, WriteResult } from "./types.js";

const debug = debuglog("memlens:notes");

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
 * @invariants The duplicate check and the insert share one write transaction, so two writers cannot
 *   both pass the check.
 * @invariants Each supersede target exists in the same scope, and each target becomes hidden.
 * @returns The new note, or the duplicate reason.
 */
export function note(store: Store, input: NoteInput): WriteResult<Note> {
	const scope = checkedScope(input.scope);
	const split = splitForWrite(input.body, input.longform ?? null);
	const reviewAt = input.review_at ?? null;
	const supersedes = input.supersedes ?? [];
	return store.publish((tx): WriteResult<Note> => {
		if (supersedes.length > 0) return { ok: true, value: noteTx(tx, input) };
		const duplicate = findDuplicate(
			tx.db,
			scope,
			split.body,
			input.kind,
			split.longform,
			reviewAt,
		);
		if (duplicate === undefined) return { ok: true, value: noteTx(tx, input) };
		debug("Note duplicate", { event: "duplicate", scope, kind: input.kind });
		return { ok: false, reason: "duplicate", value: toNote(duplicate) };
	}).value;
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
	const reviewAt = input.review_at ?? null;
	const supersedes = input.supersedes ?? [];
	const ts = input.ts ?? new Date().toISOString();
	const id = input.id ?? ulid(Date.now());
	const now = new Date().toISOString();
	if (rowById(tx.db, id) !== undefined)
		throw new MemlensError("Data", "A note id already exists.");
	const targets = targetsOf(tx.db, supersedes, scope);
	const pos = openSlot(tx.db, scope, ts, id);
	const row = insertNoteRow(tx, {
		id,
		scope,
		pos,
		input,
		body: split.body,
		longform: split.longform,
		reviewAt,
		ts,
		now,
	});
	ftsSet(tx.db, row.n, null, ftsRowOf(row));
	deleteShifted(tx.db, scope, pos);
	hideSuperseded(tx, id, now, targets);
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

/** @purpose Read each supersede target, or refuse the write when a target is absent or outside the scope. */
function targetsOf(
	db: DatabaseSync,
	supersedes: readonly Ulid[],
	scope: ScopeKey,
): readonly RawNote[] {
	return supersedes.map((target) => {
		const row = rowById(db, target);
		if (row === undefined)
			throw new MemlensError("Data", "A local target does not exist.");
		if (row.scope !== scope)
			throw new MemlensError(
				"CrossScopeSupersede",
				"A supersede target belongs to another scope.",
			);
		return row;
	});
}

/** @purpose Write one note row at its slot, and give its stored shape. */
function insertNoteRow(
	tx: Tx,
	data: {
		readonly id: Ulid;
		readonly scope: ScopeKey;
		readonly pos: number;
		readonly input: NoteInput;
		readonly body: string;
		readonly longform: string | null;
		readonly reviewAt: string | null;
		readonly ts: string;
		readonly now: string;
	},
): RawNote {
	const { input } = data;
	tx.db
		.prepare(INSERT_ROW)
		.run(
			data.id,
			data.scope,
			data.pos,
			input.kind,
			data.body,
			data.longform,
			JSON.stringify(input.refs ?? []),
			data.ts,
			data.now,
			data.now,
			data.reviewAt,
			input.session,
			input.turn,
			input.preset,
			tx.version,
			tx.version,
		);
	return requireRow(tx.db, data.id);
}

/** @purpose Hide each supersede target and keep its link to the new note. */
function hideSuperseded(
	tx: Tx,
	id: Ulid,
	now: string,
	targets: readonly RawNote[],
): void {
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
}

// #region FUNC_noteCheckedTx
/**
 * @purpose Apply one note write with ordinary duplicate rules inside a caller transaction.
 * @invariants A duplicate writes no note row, so a proposal approval that repeats a live note closes with no record.
 */
export function noteCheckedTx(tx: Tx, input: NoteInput): WriteResult<Note> {
	const scope = checkedScope(input.scope);
	const split = splitForWrite(input.body, input.longform ?? null);
	const duplicate = findDuplicate(
		tx.db,
		scope,
		split.body,
		input.kind,
		split.longform,
		input.review_at ?? null,
	);
	if (duplicate)
		return { ok: false, reason: "duplicate", value: toNote(duplicate) };
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
 * @purpose Clear the content of one note from the memory.
 * @invariants The transaction clears the row, the index row, the covering nodes, and the proposals of the target.
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
