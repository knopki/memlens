/**
 * #region moduleContract
 * @modulecontract
 * @purpose Move the complete note state between two stores and join the copies without a lost update.
 * @scope The portable line list, the import transaction, and the write of one merged row.
 *  NOT: the transfer text and the field parsers, and the merge channels.
 * @invariants The import writes one publish transaction, so a failure leaves no partial copy.
 * @invariants A tombstone travels with no content. A cleared row holds no content after the merge,
 *  and no proposal payload targets it.
 * @dependencies USES API: node:sqlite
 * @keywords transfer, jsonl, export, import, merge, row, slot, index
 * #endregion moduleContract
 */

import type { DatabaseSync, StatementSync } from "node:sqlite";
import { debuglog } from "node:util";
import { validateScopeKey } from "../domain/scope.js";
import { MemlensError } from "../types/errors.js";
import type { NoteKind, ScopeKey } from "../types/primitives.js";
import { deleteCovering, deleteRange } from "./nodes.js";
import { nullable } from "./rows.js";
import { insertSlot, nextSlot } from "./slots.js";
import type { Store, Tx } from "./store.js";
import {
	FORMAT,
	type LocalRow,
	type ParsedRow,
	parseTransfer,
	type Row,
	refsOfRow,
	rowLine,
} from "./transfer-format.js";
import {
	type Decision,
	foldClock,
	mergeRow,
	setClock,
} from "./transfer-merge.js";
import type { NoteState } from "./types.js";

const debug = debuglog("memlens:transfer");

/** The options of one import. */
export interface ImportOptions {
	/** Report each decision and write nothing. */
	readonly dryRun?: boolean;

	/** Replace each incoming non-catalog scope with this key. */
	readonly as?: ScopeKey;
}

/** The counts of one import. */
export interface ImportResult {
	/** The count of new note rows. */
	readonly applied: number;

	/** The count of local note rows that changed. */
	readonly merged: number;

	/** The count of content or review channels where the local value won. */
	readonly keptLocal: number;

	/** The count of content or review channels where the local value lost. */
	readonly lost: number;

	/** True when a cleared flag latched during this import. */
	readonly clearedApplied: boolean;
}

/** The statements of one import publish. */
interface Statements {
	select: StatementSync;
	insert: StatementSync;
	update: StatementSync;
	rowid: StatementSync;
	ftsDelete: StatementSync;
	ftsInsert: StatementSync;
	proposals: StatementSync;
}

// #region FUNC_exportLines
/**
 * @purpose Give one portable text that carries the complete note state of a store or of one scope.
 * @invariants Line one is the header. Each later line holds one note.
 * @invariants The lines hold the note rows by `(scope, pos)`.
 * @invariants A deleted or cleared note travels as a tombstone with no content.
 * @ensures An import reproduces each note field of a full row.
 * @param scope - The one scope of the export. A null gives each scope.
 */
export function exportLines(
	store: Store,
	scope: ScopeKey | null = null,
): string[] {
	const snapshot = store.read((db) => {
		const clock = db
			.prepare("SELECT value FROM meta WHERE key = 'clock'")
			.get();
		const identity = db
			.prepare("SELECT value FROM meta WHERE key = 'store_id'")
			.get();
		const rows =
			scope === null
				? db.prepare("SELECT * FROM notes ORDER BY scope, pos").all()
				: db
						.prepare("SELECT * FROM notes WHERE scope = ? ORDER BY pos")
						.all(scope);
		return {
			clock: clock === undefined ? "" : String(clock.value),
			store: identity === undefined ? "" : String(identity.value),
			rows,
		};
	});
	const header = JSON.stringify({
		format: FORMAT,
		store: snapshot.store,
		version: snapshot.clock,
	});
	const notes = snapshot.rows.map(rowLine);
	debug("Export complete", { event: "export", rows: notes.length });
	return [header, ...notes];
}
// #endregion FUNC_exportLines

// #region FUNC_importLines
/**
 * @purpose Join one transfer file into the note rows of a store with the five merge channels.
 * @invariants The call validates the complete file before the first write.
 * @invariants The option as must hold one valid scope key, or the call writes nothing.
 * @invariants A dry run reads the local rows per id and writes nothing.
 * @invariants A real run writes one publish.
 * @requires The store is open and trusts the file creator.
 * @ensures A repeated import of one file reports no applied and no merged row.
 */
export function importLines(
	store: Store,
	lines: string[],
	opts: ImportOptions = {},
): ImportResult {
	const file = parseTransfer(lines);
	if (opts.as !== undefined) {
		if (!validateScopeKey(opts.as))
			throw new MemlensError("Data", "The scope key is not valid.");
		for (const item of file.rows)
			if (!item.row.scope.startsWith("__catalog__:")) item.row.scope = opts.as;
	}
	const dryRun = opts.dryRun === true;
	const clock = foldClock(store.meta("clock") ?? "", file.versions);
	debug("Import start", {
		event: "import",
		rows: file.rows.length,
		dryRun,
	});
	if (dryRun) {
		const counted = countDecisions(store, file.rows);
		debug("Import complete", { event: "import_done", dryRun: true });
		return counted;
	}
	const result = applyRows(store, file.rows, clock);
	debug("Import complete", {
		event: "import_done",
		applied: result.applied,
		merged: result.merged,
		keptLocal: result.keptLocal,
		lost: result.lost,
		cleared: result.clearedApplied,
	});
	return result;
}
// #endregion FUNC_importLines

// #region FUNC_countDecisions
/**
 * @purpose Read each local row per id and report the counts of a real import, with no write.
 * @invariants The call runs in one deferred read transaction.
 */
function countDecisions(
	store: Store,
	rows: readonly ParsedRow[],
): ImportResult {
	const result = store.read((db) => {
		const select = db.prepare("SELECT * FROM notes WHERE id = ?");
		let applied = 0;
		let merged = 0;
		let keptLocal = 0;
		let lost = 0;
		let clearedApplied = false;
		for (const { row, tombstone } of rows) {
			const local = localFrom(select.get(row.id));
			if (local === null) {
				applied += 1;
				if (tombstone) clearedApplied = true;
				continue;
			}
			const decision = mergeRow(local, row);
			if (decision.merged.cleared && !local.cleared) clearedApplied = true;
			if (!decision.changed) continue;
			merged += 1;
			if (decision.contentKept) keptLocal += 1;
			if (decision.contentLost) lost += 1;
			if (decision.reviewKept) keptLocal += 1;
			if (decision.reviewLost) lost += 1;
		}
		return { applied, merged, keptLocal, lost, clearedApplied };
	});
	debug("Dry run complete", {
		event: "dry_run",
		applied: result.applied,
		merged: result.merged,
	});
	return result;
}
// #endregion FUNC_countDecisions

// #region FUNC_applyRows
/**
 * @purpose Write the merged note rows in one publish transaction.
 * @invariants Each absent row takes its key rank with one tail shift.
 * @invariants A winning scope change inserts the row at the destination rank and frees the old slot.
 * @invariants A changed row syncs the FTS row and deletes each node over a changed or shifted slot.
 * @invariants A lost local content or review channel appends one merge_lost fact.
 * @invariants A cleared row leaves no proposal payload that targets it.
 */
function applyRows(
	store: Store,
	rows: readonly ParsedRow[],
	clock: string,
): ImportResult {
	const ordered = [...rows].sort((left, right) => {
		const a = left.row;
		const b = right.row;
		if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
	return store.publish((tx) => {
		const sql = statementsOf(tx.db);
		if (clock !== "") setClock(tx.db, clock);
		const result = {
			applied: 0,
			merged: 0,
			keptLocal: 0,
			lost: 0,
			clearedApplied: false,
		};
		for (const { row, tombstone } of ordered) {
			const local = localFrom(sql.select.get(row.id));
			if (local === null) {
				result.applied += 1;
				if (applyMissing(tx, sql, row, tombstone)) result.clearedApplied = true;
				if (tombstone) deleteProposals(sql, row.id);
				continue;
			}
			const decision = mergeRow(local, row);
			if (decision.merged.cleared) {
				if (!local.cleared) result.clearedApplied = true;
				deleteProposals(sql, row.id);
			}
			if (!decision.changed) continue;
			writeMerged(tx, sql, local, decision.merged);
			result.merged += 1;
			countChannels(tx, row, decision, result);
		}
		return result;
	}).value;
}
// #endregion FUNC_applyRows

// #region FUNC_applyMissing
/** @purpose Insert one absent row, and report whether it latched the cleared flag. */
function applyMissing(
	tx: Tx,
	sql: Statements,
	row: Row,
	tombstone: boolean,
): boolean {
	const next = tombstone
		? {
				...row,
				state: "deleted" as NoteState,
				cleared: true,
				body: "",
				longform: null,
			}
		: row;
	insertRow(tx.db, sql, next);
	return next.cleared;
}
// #endregion FUNC_applyMissing

// #region FUNC_countChannels
/** @purpose Count the two merge channels of one changed row, and journal each loss. */
function countChannels(
	tx: Tx,
	incoming: Row,
	decision: Decision,
	result: { keptLocal: number; lost: number },
): void {
	if (decision.contentKept) result.keptLocal += 1;
	if (decision.contentLost) {
		result.lost += 1;
		tx.journal("merge_lost", incoming.id, decision.merged.scope, "content");
	}
	if (decision.reviewKept) result.keptLocal += 1;
	if (decision.reviewLost) {
		result.lost += 1;
		tx.journal("merge_lost", incoming.id, decision.merged.scope, "review");
	}
}
// #endregion FUNC_countChannels

// #region FUNC_insertRow
/**
 * @purpose Insert one absent note at its key rank, then sync the index and the node cache.
 * @invariants The tail shift moves each later slot of the scope one slot up.
 * @invariants A tombstone takes its ts as the creation and modification time, because it carries no other time.
 * @invariants Only a live row without cleared content enters the index.
 */
function insertRow(db: DatabaseSync, sql: Statements, row: Row): void {
	const scope = row.scope;
	const pos = insertSlot(db, scope, row.ts, row.id);
	const end = nextSlot(db, scope);
	deleteCovering(db, scope, pos);
	if (end > pos) deleteRange(db, scope, pos, end);
	sql.insert.run(
		row.id,
		scope,
		pos,
		row.state,
		row.cleared ? 1 : 0,
		row.kind,
		row.body,
		row.longform,
		JSON.stringify(row.refs),
		row.superseded_by,
		row.ts,
		row.created_at,
		row.modified_at,
		row.review_at,
		row.reviewed_at,
		row.session,
		row.turn,
		row.preset,
		row.v,
		row.v_content,
		row.v_review,
	);
	const id = sql.rowid.get(row.id);
	const n = Number(id?.n ?? 0);
	if (row.state === "live" && !row.cleared)
		sql.ftsInsert.run(n, row.body, row.longform);
	debug("Row inserted", { event: "insert", slot: pos, scope });
}
// #endregion FUNC_insertRow

// #region FUNC_writeMerged
/**
 * @purpose Apply one merged note row, its index rows, its node rows, and its slot.
 * @invariants A winning scope change inserts the row at the destination key rank.
 * @invariants The index drops the old row values and adds the new live row.
 */
function writeMerged(
	tx: Tx,
	sql: Statements,
	local: LocalRow,
	merged: Row,
): void {
	const db = tx.db;
	const moved = merged.scope !== local.scope;
	let pos = local.pos;
	if (moved) {
		pos = insertSlot(db, merged.scope, merged.ts, merged.id);
		const end = nextSlot(db, merged.scope);
		if (end > pos) deleteRange(db, merged.scope, pos, end);
	}
	if (local.state === "live" && !local.cleared)
		sql.ftsDelete.run(local.n, local.body, local.longform ?? "");
	sql.update.run(
		merged.scope,
		merged.state,
		merged.cleared ? 1 : 0,
		merged.kind,
		merged.body,
		merged.longform,
		JSON.stringify(merged.refs),
		merged.superseded_by,
		merged.ts,
		merged.created_at,
		merged.modified_at,
		merged.review_at,
		merged.reviewed_at,
		merged.session,
		merged.turn,
		merged.preset,
		merged.v,
		merged.v_content,
		merged.v_review,
		pos,
		merged.id,
	);
	if (merged.state === "live" && !merged.cleared)
		sql.ftsInsert.run(local.n, merged.body, merged.longform);
	deleteCovering(db, local.scope, local.pos);
	if (moved) deleteCovering(db, merged.scope, pos);
	debug("Row merged", { event: "merge", moved, scope: merged.scope });
}
// #endregion FUNC_writeMerged

// #region FUNC_statementsOf
/**
 * @purpose Prepare each statement of one import publish one time.
 * @invariants The index delete command carries the old body and longform of the row.
 */
function statementsOf(db: DatabaseSync): Statements {
	return {
		select: db.prepare("SELECT * FROM notes WHERE id = ?"),
		insert: db.prepare(
			`INSERT INTO notes (id, scope, pos, state, cleared, kind, body, longform, refs, superseded_by, ts, created_at, modified_at, review_at, reviewed_at, session, turn, preset, v, v_content, v_review)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		),
		update: db.prepare(
			`UPDATE notes SET scope = ?, state = ?, cleared = ?, kind = ?, body = ?, longform = ?, refs = ?, superseded_by = ?, ts = ?, created_at = ?, modified_at = ?, review_at = ?, reviewed_at = ?, session = ?, turn = ?, preset = ?, v = ?, v_content = ?, v_review = ?, pos = ?
			WHERE id = ?`,
		),
		rowid: db.prepare("SELECT n FROM notes WHERE id = ?"),
		ftsDelete: db.prepare(
			"INSERT INTO fts(fts, rowid, body, longform) VALUES ('delete', ?, ?, ?)",
		),
		ftsInsert: db.prepare(
			"INSERT INTO fts(rowid, body, longform) VALUES (?, ?, ?)",
		),
		proposals: db.prepare("DELETE FROM proposals WHERE target = ?"),
	};
}
// #endregion FUNC_statementsOf

function deleteProposals(sql: Statements, id: string): void {
	sql.proposals.run(id);
}

// #region FUNC_localFrom
/** @purpose Read one local note row, or null when the id is absent. */
function localFrom(row: Record<string, unknown> | undefined): LocalRow | null {
	if (row === undefined) return null;
	return {
		n: Number(row.n),
		pos: Number(row.pos),
		id: String(row.id),
		scope: String(row.scope) as ScopeKey,
		ts: String(row.ts),
		state: String(row.state) as NoteState,
		cleared: Number(row.cleared) === 1,
		kind: String(row.kind) as NoteKind,
		body: String(row.body),
		longform: nullable(row.longform),
		refs: refsOfRow(row.refs),
		superseded_by: nullable(row.superseded_by),
		session: String(row.session),
		turn: String(row.turn),
		preset: String(row.preset),
		review_at: nullable(row.review_at),
		reviewed_at: nullable(row.reviewed_at),
		created_at: String(row.created_at),
		modified_at: String(row.modified_at),
		v: String(row.v),
		v_content: String(row.v_content),
		v_review: nullable(row.v_review),
	};
}
// #endregion FUNC_localFrom
