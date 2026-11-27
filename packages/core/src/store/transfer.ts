/**
 * #region moduleContract
 * @modulecontract
 * @purpose Move the complete note state between two stores and join the copies without a lost update.
 * @scope The portable line list, the import plan, and the one-transaction write of the planned rows.
 *  NOT: the transfer text and the field parsers, and the merge channels.
 * @invariants The import writes one publish transaction, so a failure leaves no partial copy.
 * @invariants The plan phase reads each local row before the first note write, so no merge sees
 *  another write of this import.
 * @invariants A tombstone travels with no content. A cleared row holds no content after the merge,
 *  and no proposal payload targets it.
 * @dependencies USES API: node:sqlite
 * @keywords transfer, jsonl, export, import, merge, row, slot, plan, index
 * #endregion moduleContract
 */

import type { DatabaseSync, StatementSync } from "node:sqlite";
import { debuglog } from "node:util";
import type { NoteKind, ScopeKey } from "../types/primitives.js";
import { deleteCovering, deleteRange } from "./nodes.js";
import { nullable } from "./rows.js";
import { ScopeSlots, type SlotShift } from "./slot-model.js";
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
	movePos: StatementSync;
	vacate: StatementSync;
	rowid: StatementSync;
	ftsDelete: StatementSync;
	ftsInsert: StatementSync;
	proposals: StatementSync;
}

/** The mutable counts of one import. */
type MutableResult = {
	applied: number;
	merged: number;
	keptLocal: number;
	lost: number;
	clearedApplied: boolean;
};

/** One absent note row with its final slot. */
interface PlannedInsert {
	readonly row: Row;
	readonly pos: number;
}

/** One changed note row, with its final slot. */
interface PlannedMerge {
	readonly local: LocalRow;
	readonly merged: Row;
	pos: number;

	/** The source slot at the time of a move, or null without a move. */
	readonly vacated: number | null;
}

/** The write plan of one import. */
interface Plan {
	/** The slot model of each scope that the import touched. */
	readonly models: Map<ScopeKey, ScopeSlots>;

	/** Each absent note row with its final slot. */
	readonly inserts: PlannedInsert[];

	/** Each changed note row, with its final slot. */
	readonly merges: PlannedMerge[];

	/** Each stored note that moved with no other write. */
	readonly shifts: SlotShift[];

	/** Each note whose current slot must go free before the writes. */
	readonly vacate: Set<string>;

	/** The lowest slot that an insert opened, per scope. */
	readonly minInsert: Map<ScopeKey, number>;

	/** The counts of the import. */
	readonly result: MutableResult;
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
 * @invariants The plan phase replays each slot event in key order, so each row takes its final slot
 *  once and no row-by-row tail shift runs.
 * @requires The rows come sorted by key, so the replay gives each slot that the SQL write gives.
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
		const plan = planRows(tx, sql, ordered);
		applyPlan(tx.db, sql, plan);
		return plan.result;
	}).value;
}
// #endregion FUNC_applyRows

// #region FUNC_planRows
/**
 * @purpose Replay each row of one import against the slot models, and queue each note write.
 * @invariants The phase reads each local row before the first note write, so no merge sees another
 *  write of this import.
 * @invariants An absent row takes its key rank in the model of its scope.
 * @invariants A winning scope change takes the row out of the source model and opens its destination
 *  rank.
 * @invariants A stored row that wins the content channel keeps its slot, also under a new key.
 */
function planRows(
	tx: Tx,
	sql: Statements,
	ordered: readonly ParsedRow[],
): Plan {
	const plan: Plan = {
		models: new Map(),
		inserts: [],
		merges: [],
		shifts: [],
		vacate: new Set(),
		minInsert: new Map(),
		result: {
			applied: 0,
			merged: 0,
			keptLocal: 0,
			lost: 0,
			clearedApplied: false,
		},
	};
	for (const { row, tombstone } of ordered) {
		const local = localFrom(sql.select.get(row.id));
		if (local === null) {
			plan.result.applied += 1;
			const pos = planInsert(tx.db, plan, row.scope, row.ts, row.id);
			plan.inserts.push({ row, pos });
			if (row.cleared) plan.result.clearedApplied = true;
			if (tombstone) deleteProposals(sql, row.id);
			continue;
		}
		const decision = mergeRow(local, row);
		if (decision.merged.cleared) {
			if (!local.cleared) plan.result.clearedApplied = true;
			deleteProposals(sql, row.id);
		}
		if (!decision.changed) continue;
		const merged = decision.merged;
		let vacated: number | null = null;
		if (merged.scope !== local.scope) {
			vacated = modelOf(tx.db, plan.models, local.scope).remove(local.id).pos;
			planInsert(tx.db, plan, merged.scope, merged.ts, merged.id);
		} else if (merged.ts !== local.ts) {
			modelOf(tx.db, plan.models, local.scope).rekey(local.id, merged.ts);
		}
		plan.merges.push({ local, merged, pos: local.pos, vacated });
		plan.result.merged += 1;
		countChannels(tx, row, decision, plan.result);
	}
	resolvePositions(plan);
	debug("Plan complete", {
		event: "plan",
		inserts: plan.inserts.length,
		merges: plan.merges.length,
		shifts: plan.shifts.length,
	});
	return plan;
}
// #endregion FUNC_planRows

// #region FUNC_planInsert
/** @purpose Open the slot of one new key in the model, and track the lowest open slot per scope. */
function planInsert(
	db: DatabaseSync,
	plan: Plan,
	scope: ScopeKey,
	ts: string,
	id: string,
): number {
	const pos = modelOf(db, plan.models, scope).openSlot(ts, id);
	const known = plan.minInsert.get(scope);
	if (known === undefined || pos < known) plan.minInsert.set(scope, pos);
	return pos;
}
// #endregion FUNC_planInsert

// #region FUNC_modelOf
/** @purpose Give the slot model of one scope, and load it on the first touch. */
function modelOf(
	db: DatabaseSync,
	models: Map<ScopeKey, ScopeSlots>,
	scope: ScopeKey,
): ScopeSlots {
	let model = models.get(scope);
	if (model === undefined) {
		model = ScopeSlots.read(db, scope);
		models.set(scope, model);
	}
	return model;
}
// #endregion FUNC_modelOf

// #region FUNC_resolvePositions
/**
 * @purpose Give each planned merge its final slot, and list each stored note that moved.
 * @invariants Each final slot comes from the model after the full replay, so a later insert moves a
 *  merged row too.
 * @invariants A note whose slot or scope changes goes to the vacate set, so its old place goes free
 *  before the writes.
 */
function resolvePositions(plan: Plan): void {
	for (const merge of plan.merges) {
		const model = plan.models.get(merge.merged.scope);
		if (model !== undefined)
			merge.pos = model.posOf(merge.merged.id) ?? merge.local.pos;
		if (merge.vacated !== null || merge.pos !== merge.local.pos)
			plan.vacate.add(merge.local.id);
	}
	const mergedIds = new Set(plan.merges.map((item) => item.local.id));
	for (const model of plan.models.values())
		for (const shift of model.shifted()) {
			if (mergedIds.has(shift.id)) continue;
			plan.shifts.push(shift);
			plan.vacate.add(shift.id);
		}
}
// #endregion FUNC_resolvePositions

// #region FUNC_applyPlan
/**
 * @purpose Write the planned rows in one pass.
 * @invariants The vacate statements free each changed slot first, so no pair of slots clashes.
 * @invariants One range delete per touched scope covers each slot that an insert or a shift changed.
 * @invariants A changed row syncs the index row, and a moved row deletes the nodes over its vacated
 *  source slot.
 * @invariants Only a live row without cleared content enters the index.
 */
function applyPlan(db: DatabaseSync, sql: Statements, plan: Plan): void {
	for (const id of plan.vacate) sql.vacate.run(id);
	for (const merge of plan.merges) {
		const { local, merged } = merge;
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
			merge.pos,
			merged.id,
		);
		if (merged.state === "live" && !merged.cleared)
			sql.ftsInsert.run(local.n, merged.body, merged.longform);
		deleteCovering(db, merged.scope, merge.pos);
		if (merge.vacated !== null) deleteCovering(db, local.scope, merge.vacated);
		debug("Row merged", {
			event: "merge",
			moved: merge.vacated !== null,
			scope: merged.scope,
		});
	}
	for (const insert of plan.inserts) {
		const row = insert.row;
		sql.insert.run(
			row.id,
			row.scope,
			insert.pos,
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
		const n = Number(sql.rowid.get(row.id)?.n ?? 0);
		if (row.state === "live" && !row.cleared)
			sql.ftsInsert.run(n, row.body, row.longform);
		debug("Row inserted", {
			event: "insert",
			slot: insert.pos,
			scope: row.scope,
		});
	}
	for (const shift of plan.shifts) sql.movePos.run(shift.pos, shift.id);
	for (const [scope, model] of plan.models) {
		const from = plan.minInsert.get(scope);
		if (from !== undefined) deleteRange(db, scope, from, model.maxPos() + 1);
	}
}
// #endregion FUNC_applyPlan

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
		movePos: db.prepare("UPDATE notes SET pos = ? WHERE id = ?"),
		vacate: db.prepare("UPDATE notes SET pos = -pos - 1 WHERE id = ?"),
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
