/**
 * #region moduleContract
 * @purpose Move the complete note state between two stores and join the copies without a lost update.
 * @scope The JSONL text, the digest, the import validation, the five merge channels, and the clock receive.
 * @invariants The export lists the note rows by `(scope, pos)` between one header and one trailer.
 * @invariants The import writes one publish transaction, so a failure leaves no partial copy.
 * @invariants A second import of one file changes no note row.
 * @invariants Lifecycle joins to the maximum, cleared latches to true, and a content or review value follows its version.
 * @invariants A tombstone travels with no content. A cleared row holds no content after the merge.
 * @invariants The clock ends above each incoming version, because a local write after an import must outrank it.
 * @dependencies node:crypto, store/store.ts, store/clock.ts, store/slots.ts, store/nodes.ts, types/errors.ts.
 * @keywords transfer, jsonl, export, import, merge, digest, clock, channel, tombstone
 * #endregion moduleContract
 */

import { createHash } from "node:crypto";
import type { DatabaseSync, StatementSync } from "node:sqlite";
import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";
import type { NoteKind, ScopeKey } from "../types/events.js";
import { parseVersion } from "./clock.js";
import { deleteCovering, deleteRange } from "./nodes.js";
import { insertSlot, nextSlot } from "./slots.js";
import type { Store, Tx } from "./store.js";
import type { NoteState } from "./types.js";

const debug = debuglog("memlens:transfer");

/** The format number of this transfer build. */
const FORMAT = 1;

/** The greatest count of note lines that one file may hold. */
const MAX_ROWS = 200_000;

const STATES: readonly NoteState[] = ["live", "hidden", "deleted"];
const KINDS: readonly NoteKind[] = [
	"decision",
	"preference",
	"fact",
	"task",
	"note",
];
const STATE_RANK: Record<NoteState, number> = {
	live: 0,
	hidden: 1,
	deleted: 2,
};

/** One note with every field of the table, in JSON form. */
interface Row {
	id: string;
	scope: ScopeKey;
	ts: string;
	state: NoteState;
	cleared: boolean;
	kind: NoteKind;
	body: string;
	longform: string | null;
	refs: string[];
	superseded_by: string | null;
	session: string;
	turn: string;
	preset: string;
	review_at: string | null;
	reviewed_at: string | null;
	created_at: string;
	modified_at: string;
	v: string;
	v_content: string;
	v_review: string | null;
}

/** One note row of the local table with its rowid and slot. */
interface LocalRow extends Row {
	n: number;
	pos: number;
}

/** One parsed note line. A tombstone line holds no content. */
interface ParsedRow {
	row: Row;
	tombstone: boolean;
}

/** One validated file. */
interface ParsedFile {
	rows: ParsedRow[];
	versions: string[];
}

/** The result of one merge of a local row and an incoming row. */
interface Decision {
	merged: Row;
	changed: boolean;
	contentLost: boolean;
	contentKept: boolean;
	reviewLost: boolean;
	reviewKept: boolean;
}

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
}

// #region FUNC_exportLines

/**
 * @purpose Give one portable text that carries the complete note state of a store.
 * @invariants Line one is the header. The last line is the trailer.
 * @invariants A deleted or cleared note travels as a tombstone with no content.
 * @ensures An import reproduces each note field of a full row.
 */
export function exportLines(store: Store): string[] {
	const snapshot = store.read((db) => {
		const clock = db
			.prepare("SELECT value FROM meta WHERE key = 'clock'")
			.get();
		const identity = db
			.prepare("SELECT value FROM meta WHERE key = 'store_id'")
			.get();
		const rows = db.prepare("SELECT * FROM notes ORDER BY scope, pos").all();
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
	const digest = digestOf([header, ...notes]);
	const trailer = JSON.stringify({ count: notes.length, digest });
	debug("Export complete", { event: "export", rows: notes.length });
	return [header, ...notes, trailer];
}

// #endregion FUNC_exportLines

// #region FUNC_rowLine

/**
 * @purpose Render one note row as one JSONL line with a stable field order.
 * @invariants A tombstone holds id, scope, ts, state, cleared, and the three versions only.
 * @invariants A full row keeps a null longform as null.
 */
function rowLine(row: Record<string, unknown>): string {
	const id = String(row.id);
	const scope = String(row.scope);
	const ts = String(row.ts);
	const state = String(row.state) as NoteState;
	const cleared = Number(row.cleared) === 1;
	const v = String(row.v);
	const vContent = String(row.v_content);
	const vReview = textOrNull(row.v_review);
	if (state === "deleted" || cleared)
		return JSON.stringify({
			id,
			scope,
			ts,
			state,
			cleared,
			v,
			v_content: vContent,
			v_review: vReview,
		});
	return JSON.stringify({
		id,
		scope,
		ts,
		state,
		cleared,
		kind: String(row.kind),
		body: String(row.body),
		longform: textOrNull(row.longform),
		refs: refsFrom(row.refs),
		superseded_by: textOrNull(row.superseded_by),
		session: String(row.session),
		turn: String(row.turn),
		preset: String(row.preset),
		review_at: textOrNull(row.review_at),
		reviewed_at: textOrNull(row.reviewed_at),
		created_at: String(row.created_at),
		modified_at: String(row.modified_at),
		v,
		v_content: vContent,
		v_review: vReview,
	});
}

// #endregion FUNC_rowLine

// #region FUNC_importLines

/**
 * @purpose Join one transfer file into the note rows of a store with the five merge channels.
 * @invariants The call validates the complete file before the first write.
 * @invariants A dry run reads the local rows per id and writes nothing.
 * @invariants A real run writes one publish, then truncates the log when a cleared flag latched.
 * @requires The store is open and trusts the file creator.
 * @ensures A repeated import of one file reports no applied and no merged row.
 */
export function importLines(
	store: Store,
	lines: string[],
	opts: ImportOptions = {},
): ImportResult {
	const file = parseTransfer(lines);
	if (opts.as !== undefined)
		for (const item of file.rows)
			if (!item.row.scope.startsWith("__catalog__:")) item.row.scope = opts.as;
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
	if (result.clearedApplied) store.truncate();
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

// #region FUNC_parseTransfer

/**
 * @purpose Read and validate the complete file before the store sees one write.
 * @invariants The header names format 1. The trailer count and digest must match the note lines.
 * @invariants One file holds at most 200000 note lines and no duplicate id.
 * @returns The note rows in file order, and each version that the clock must receive.
 */
function parseTransfer(input: readonly string[]): ParsedFile {
	const lines = [...input];
	while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	if (lines.length < 2)
		throw new MemlensError(
			"Data",
			"The transfer file has no header and trailer.",
		);
	const header = parseObject(lines[0], "header");
	if (header.format !== FORMAT)
		throw new MemlensError("Data", `The transfer format is not ${FORMAT}.`);
	const trailer = parseObject(lines[lines.length - 1], "trailer");
	const noteLines = lines.slice(1, -1);
	if (noteLines.length > MAX_ROWS)
		throw new MemlensError(
			"Data",
			`The transfer file holds more than ${MAX_ROWS} note lines.`,
		);
	if (
		typeof trailer.digest !== "string" ||
		trailer.digest !== digestOf(lines.slice(0, -1))
	)
		throw new MemlensError(
			"Data",
			"The transfer digest does not match the lines.",
		);
	if (Number(trailer.count) !== noteLines.length)
		throw new MemlensError(
			"Data",
			"The transfer count does not match the note lines.",
		);
	const rows: ParsedRow[] = [];
	const ids = new Set<string>();
	for (const line of noteLines) {
		const row = parseRow(parseObject(line, "note"));
		if (ids.has(row.id))
			throw new MemlensError(
				"Data",
				"The transfer file holds duplicate note ids.",
			);
		ids.add(row.id);
		rows.push({ row, tombstone: row.state === "deleted" || row.cleared });
	}
	const versions: string[] = [];
	if (typeof header.version === "string") versions.push(header.version);
	for (const { row } of rows) {
		versions.push(row.v, row.v_content);
		if (row.v_review !== null) versions.push(row.v_review);
	}
	debug("Transfer parsed", { event: "parse", rows: rows.length });
	return { rows, versions };
}

// #endregion FUNC_parseTransfer

// #region FUNC_parseRow

/**
 * @purpose Read one JSON object as a note with the field limits of the table.
 * @invariants A missing content field takes the default of a tombstone.
 * @invariants A cleared row must be deleted, as the table constraint requires.
 */
function parseRow(value: Record<string, unknown>): Row {
	const id = requiredText(value.id, "id");
	const scope = requiredText(value.scope, "scope") as ScopeKey;
	const ts = requiredText(value.ts, "ts");
	const state = parseState(value.state);
	const cleared = parseCleared(value.cleared);
	if (cleared && state !== "deleted")
		throw new MemlensError("Data", "A cleared note must be deleted.");
	const v = requiredText(value.v, "v");
	const vContent = requiredText(value.v_content, "v_content");
	const vReview = optionalText(value.v_review);
	if (state === "deleted" || cleared)
		return {
			id,
			scope,
			ts,
			state: "deleted",
			cleared: true,
			kind: "note",
			body: "",
			longform: null,
			refs: [],
			superseded_by: null,
			session: "",
			turn: "",
			preset: "",
			review_at: null,
			reviewed_at: null,
			created_at: ts,
			modified_at: ts,
			v,
			v_content: vContent,
			v_review: vReview,
		};
	return {
		id,
		scope,
		ts,
		state,
		cleared: false,
		kind: parseKind(value.kind),
		body: optionalText(value.body) ?? "",
		longform: optionalText(value.longform),
		refs: parseRefs(value.refs),
		superseded_by: optionalText(value.superseded_by),
		session: optionalText(value.session) ?? "",
		turn: optionalText(value.turn) ?? "",
		preset: optionalText(value.preset) ?? "",
		review_at: optionalText(value.review_at),
		reviewed_at: optionalText(value.reviewed_at),
		created_at: optionalText(value.created_at) ?? ts,
		modified_at: optionalText(value.modified_at) ?? ts,
		v,
		v_content: vContent,
		v_review: vReview,
	};
}

// #endregion FUNC_parseRow

// #region FUNC_mergeRow

/**
 * @purpose Join the five channels of one present note with its incoming copy.
 * @invariants Lifecycle takes the greater rank, and cleared latches to true.
 * @invariants The content group follows the greater v_content and skips a deleted or cleared row.
 * @invariants The review group follows the greater v_review. The first supersede link stays.
 * @invariants Each later version field takes the text maximum. The earlier created_at stays.
 * @invariants The later modified_at stays, because a lifecycle write also stamps it.
 * @returns The merged row, the change flag, and the two channel outcomes.
 */
function mergeRow(local: LocalRow, incoming: Row): Decision {
	const merged: Row = { ...local };
	merged.state =
		STATE_RANK[incoming.state] > STATE_RANK[local.state]
			? incoming.state
			: local.state;
	merged.cleared = local.cleared || incoming.cleared;
	merged.v = maxText(local.v, incoming.v);
	merged.v_content = maxText(local.v_content, incoming.v_content);
	merged.v_review = maxReview(local.v_review, incoming.v_review);
	merged.created_at = minText(local.created_at, incoming.created_at);
	merged.modified_at = maxText(local.modified_at, incoming.modified_at);
	merged.superseded_by = local.superseded_by ?? incoming.superseded_by;
	let contentLost = false;
	let contentKept = false;
	let reviewLost = false;
	let reviewKept = false;
	if (merged.state !== "deleted" && !merged.cleared) {
		if (incoming.v_content > local.v_content) {
			contentLost = contentDiffers(local, incoming);
			copyContent(merged, incoming);
		} else if (
			local.v_content > incoming.v_content &&
			contentDiffers(local, incoming)
		) {
			contentKept = true;
		}
	}
	if (merged.cleared) {
		merged.state = "deleted";
		merged.body = "";
		merged.longform = null;
	}
	if (
		incoming.v_review !== null &&
		(local.v_review === null || incoming.v_review > local.v_review)
	) {
		reviewLost = local.v_review !== null && reviewDiffers(local, incoming);
		merged.review_at = incoming.review_at;
		merged.reviewed_at = incoming.reviewed_at;
	} else if (
		incoming.v_review !== null &&
		local.v_review !== null &&
		local.v_review > incoming.v_review
	) {
		reviewKept = reviewDiffers(local, incoming);
	}
	return {
		merged,
		changed: rowDiffers(local, merged),
		contentLost,
		contentKept,
		reviewLost,
		reviewKept,
	};
}

// #endregion FUNC_mergeRow

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
		let applied = 0;
		let merged = 0;
		let keptLocal = 0;
		let lost = 0;
		let clearedApplied = false;
		for (const { row, tombstone } of ordered) {
			const local = localFrom(sql.select.get(row.id));
			if (local === null) {
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
				applied += 1;
				if (next.cleared) clearedApplied = true;
				continue;
			}
			const decision = mergeRow(local, row);
			if (decision.merged.cleared && !local.cleared) clearedApplied = true;
			if (!decision.changed) continue;
			writeMerged(tx, sql, local, decision.merged);
			merged += 1;
			if (decision.contentKept) keptLocal += 1;
			if (decision.contentLost) {
				lost += 1;
				tx.journal("merge_lost", row.id, decision.merged.scope, "content");
			}
			if (decision.reviewKept) keptLocal += 1;
			if (decision.reviewLost) {
				lost += 1;
				tx.journal("merge_lost", row.id, decision.merged.scope, "review");
			}
		}
		return { applied, merged, keptLocal, lost, clearedApplied };
	}).value;
}

// #endregion FUNC_applyRows

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

// #region FUNC_foldClock

/**
 * @purpose Give the clock text that outranks the current value and each incoming version.
 * @invariants Only a version text that parses can raise the clock.
 * @returns The greatest valid text, or the empty text when none parses.
 */
function foldClock(current: string, versions: readonly string[]): string {
	let greatest = parseVersion(current) === null ? "" : current;
	for (const value of versions)
		if (parseVersion(value) !== null && value > greatest) greatest = value;
	return greatest;
}

// #endregion FUNC_foldClock

/** @purpose Write the clock text of one store connection. */
function setClock(db: DatabaseSync, value: string): void {
	db.prepare(
		"INSERT INTO meta (key, value) VALUES ('clock', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
	).run(value);
}

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
	};
}

// #endregion FUNC_statementsOf

/** @purpose Hash the complete text of each line before the trailer. */
function digestOf(lines: readonly string[]): string {
	return createHash("sha256").update(lines.join("\n")).digest("hex");
}

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
		longform: textOrNull(row.longform),
		refs: refsFrom(row.refs),
		superseded_by: textOrNull(row.superseded_by),
		session: String(row.session),
		turn: String(row.turn),
		preset: String(row.preset),
		review_at: textOrNull(row.review_at),
		reviewed_at: textOrNull(row.reviewed_at),
		created_at: String(row.created_at),
		modified_at: String(row.modified_at),
		v: String(row.v),
		v_content: String(row.v_content),
		v_review: textOrNull(row.v_review),
	};
}

/** @purpose Copy each content field of the incoming row into the merged row. */
function copyContent(target: Row, source: Row): void {
	target.scope = source.scope;
	target.ts = source.ts;
	target.kind = source.kind;
	target.body = source.body;
	target.longform = source.longform;
	target.refs = source.refs;
	target.session = source.session;
	target.turn = source.turn;
	target.preset = source.preset;
}

/** @purpose Report whether two content groups differ. */
function contentDiffers(left: Row, right: Row): boolean {
	return (
		left.scope !== right.scope ||
		left.ts !== right.ts ||
		left.kind !== right.kind ||
		left.body !== right.body ||
		left.longform !== right.longform ||
		!sameRefs(left.refs, right.refs) ||
		left.session !== right.session ||
		left.turn !== right.turn ||
		left.preset !== right.preset
	);
}

/** @purpose Report whether two review groups differ. */
function reviewDiffers(left: Row, right: Row): boolean {
	return (
		left.review_at !== right.review_at || left.reviewed_at !== right.reviewed_at
	);
}

/** @purpose Report whether one merge changed a stored field of the note. */
function rowDiffers(left: Row, right: Row): boolean {
	return (
		left.scope !== right.scope ||
		left.ts !== right.ts ||
		left.state !== right.state ||
		left.cleared !== right.cleared ||
		left.kind !== right.kind ||
		left.body !== right.body ||
		left.longform !== right.longform ||
		!sameRefs(left.refs, right.refs) ||
		left.superseded_by !== right.superseded_by ||
		left.session !== right.session ||
		left.turn !== right.turn ||
		left.preset !== right.preset ||
		left.review_at !== right.review_at ||
		left.reviewed_at !== right.reviewed_at ||
		left.created_at !== right.created_at ||
		left.modified_at !== right.modified_at ||
		left.v !== right.v ||
		left.v_content !== right.v_content ||
		left.v_review !== right.v_review
	);
}

/** @purpose Compare two arrays of refs by value. */
function sameRefs(left: readonly string[], right: readonly string[]): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

/** @purpose Read one JSON line as an object. */
function parseObject(
	text: string | undefined,
	role: string,
): Record<string, unknown> {
	let value: unknown;
	try {
		value = JSON.parse(text ?? "");
	} catch {
		throw new MemlensError("Data", `The transfer ${role} is not JSON.`);
	}
	if (value === null || typeof value !== "object" || Array.isArray(value))
		throw new MemlensError("Data", `The transfer ${role} is not an object.`);
	return value as Record<string, unknown>;
}

/** @purpose Read one required text field. */
function requiredText(value: unknown, name: string): string {
	if (typeof value !== "string" || value.length === 0)
		throw new MemlensError("Data", `A note needs a text ${name}.`);
	return value;
}

/** @purpose Read one optional text field. */
function optionalText(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== "string")
		throw new MemlensError("Data", "A note text field is not text.");
	return value;
}

/** @purpose Read one nullable text of a table row. */
function textOrNull(value: unknown): string | null {
	return value === null || value === undefined ? null : String(value);
}

/** @purpose Read the cleared flag as a boolean. */
function parseCleared(value: unknown): boolean {
	if (value === undefined || value === null) return false;
	if (value === true || value === 1) return true;
	if (value === false || value === 0) return false;
	throw new MemlensError("Data", "A cleared flag is not a boolean.");
}

/** @purpose Read one lifecycle state. */
function parseState(value: unknown): NoteState {
	if (typeof value === "string" && STATES.includes(value as NoteState))
		return value as NoteState;
	throw new MemlensError("Data", "A note state is not known.");
}

/** @purpose Read one note kind. */
function parseKind(value: unknown): NoteKind {
	if (value === undefined || value === null) return "note";
	if (typeof value === "string" && KINDS.includes(value as NoteKind))
		return value as NoteKind;
	throw new MemlensError("Data", "A note kind is not known.");
}

/** @purpose Read the refs of one note. */
function parseRefs(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
		throw new MemlensError("Data", "The refs of a note are not text.");
	return [...value] as string[];
}

/** @purpose Parse the refs text of one table row. */
function refsFrom(value: unknown): string[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(String(value ?? "[]"));
	} catch {
		throw new MemlensError("Data", "A note row holds invalid refs.");
	}
	if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string"))
		throw new MemlensError("Data", "A note row holds invalid refs.");
	return parsed as string[];
}

/** @purpose Give the greater of two version texts. */
function maxText(left: string, right: string): string {
	return left > right ? left : right;
}

/** @purpose Give the earlier of two texts. */
function minText(left: string, right: string): string {
	return left < right ? left : right;
}

/** @purpose Give the greater review version, where null is the least. */
function maxReview(left: string | null, right: string | null): string | null {
	if (left === null) return right;
	if (right === null) return left;
	return left > right ? left : right;
}
