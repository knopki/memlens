/**
 * #region moduleContract
 * @modulecontract
 * @purpose Find the damaged cache rows of a store and bound the audit journal, so a read never sees a stale summary.
 * @scope The quick check, the index drift, the invalid and the empty node rows, and the journal retention.
 *        NOT: the note rows, the schema, or the clock.
 * @invariants The scan runs in one read transaction. The fixes run in one publish call.
 * @invariants A clean store returns no action. The check changes no row of a clean store.
 * @dependencies USES API: node:sqlite
 * @keywords repair, check, node, validity, fts, drift, journal, prune, retention
 * #endregion moduleContract
 */

import type { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import type { ScopeKey } from "../types/primitives.js";
import { liveInStore, validNode, widthOf } from "./nodes.js";
import { nodeFromRow } from "./rows.js";
import type { Store } from "./store.js";
import type { Node } from "./types.js";

const debug = debuglog("memlens:repair");

/** The milliseconds of one day. */
const DAY_MS = 86_400_000;

/** The default journal retention in days. */
const JOURNAL_DAYS = 365;

/** The default journal retention in rows. */
const JOURNAL_MAX = 50_000;

// #region TYPE_RepairOptions
/**
 * @purpose Name the retention limits of one check, so the caller keeps the journal in bounds.
 * @invariants A missing limit takes the default of the store.
 */
export interface RepairOptions {
	/** The journal age limit in days. The default is 365. */
	readonly journalDays?: number;

	/** The journal row limit. The default is 50000. */
	readonly journalMax?: number;

	/** Report actions without writing changes. */
	readonly dryRun?: boolean;
}
// #endregion TYPE_RepairOptions

/** The primary key of one node row. */
interface NodeKey {
	readonly scope: ScopeKey;
	readonly level: number;
	readonly start: number;
}

/** The result of one scan of the store. */
interface Plan {
	readonly problems: readonly string[];
	readonly indexed: number;
	readonly live: number;
	readonly invalid: readonly NodeKey[];
	readonly empty: readonly NodeKey[];
	readonly journal: number;
}

// #region FUNC_check
/**
 * @purpose Find each damaged row, repair what a cache may lose, and prune the journal, so a store stays consistent.
 * @invariants The node rows that fail the validity rules go. The node rows over no live note go.
 * @invariants A difference between the index rows and the live notes rebuilds the index.
 * @invariants The journal keeps the newest rows inside the age limit and the row limit.
 * @ensures The check returns one short string for each applied action. A clean store gives none.
 * @param store - The open store.
 * @param opts - The journal retention limits.
 * @returns The applied actions and the quick check problems.
 */
export function check(
	store: Store,
	opts: RepairOptions = {},
): readonly string[] {
	const days = opts.journalDays ?? JOURNAL_DAYS;
	const max = opts.journalMax ?? JOURNAL_MAX;
	const cutoff = new Date(Date.now() - days * DAY_MS).toISOString();
	const plan = store.read((db) => scan(db, cutoff, max));
	const drift = plan.indexed !== plan.live;
	const findings = plan.problems.map(
		(text) => `quick_check found an error: ${text}`,
	);
	if (
		!drift &&
		plan.invalid.length === 0 &&
		plan.empty.length === 0 &&
		plan.journal === 0
	) {
		debug("Check clean", { event: "check", actions: 0 });
		return findings;
	}
	if (opts.dryRun) {
		const actions = plannedActions(plan);
		debug("Check dry run", { event: "check", actions: actions.length });
		return [...findings, ...actions];
	}
	const actions = store.publish((tx) => {
		const applied: string[] = [];
		if (drift) {
			rebuildIndex(tx.db);
			applied.push(
				`repair fts index (${plan.indexed} indexed, ${plan.live} live)`,
			);
		}
		if (plan.invalid.length > 0) {
			deleteNodes(tx.db, plan.invalid);
			applied.push(`delete ${plan.invalid.length} invalid node rows`);
		}
		if (plan.empty.length > 0) {
			deleteNodes(tx.db, plan.empty);
			applied.push(`delete ${plan.empty.length} empty node rows`);
		}
		if (plan.journal > 0) {
			const pruned = pruneJournal(tx.db, cutoff, max);
			if (pruned > 0) applied.push(`prune ${pruned} journal rows`);
		}
		for (const action of applied)
			debug("Repair action", { event: "action", action });
		return applied;
	}).value;
	debug("Check done", { event: "check", actions: actions.length });
	return [...findings, ...actions];
}
// #endregion FUNC_check

// #region FUNC_plannedActions
/**
 * @purpose Name each action of a check without a write, so a dry run reports the same text.
 * @invariants The plan holds one snapshot of the rows, so each decision agrees.
 * @invariants The actions follow the order: the index, the invalid rows, the empty rows, the journal.
 */
function plannedActions(plan: Plan): readonly string[] {
	const actions: string[] = [];
	if (plan.indexed !== plan.live)
		actions.push(
			`repair fts index (${plan.indexed} indexed, ${plan.live} live)`,
		);
	if (plan.invalid.length > 0)
		actions.push(`delete ${plan.invalid.length} invalid node rows`);
	if (plan.empty.length > 0)
		actions.push(`delete ${plan.empty.length} empty node rows`);
	if (plan.journal > 0) actions.push(`prune ${plan.journal} journal rows`);
	return actions;
}
// #endregion FUNC_plannedActions

function scan(db: DatabaseSync, cutoff: string, max: number): Plan {
	const problems = quickCheck(db);
	const indexed = count(db, "SELECT count(*) AS c FROM fts_docsize");
	const live = count(
		db,
		"SELECT count(*) AS c FROM notes WHERE state = 'live' AND cleared = 0",
	);
	const invalid: NodeKey[] = [];
	const empty: NodeKey[] = [];
	const rows = db
		.prepare(
			"SELECT scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key FROM nodes",
		)
		.all();
	for (const row of rows) {
		const node = nodeFromRow(row);
		if (!validNode(db, node)) {
			invalid.push(keyOf(node));
			continue;
		}
		if (
			!liveInStore(db, node.scope, node.start, node.start + widthOf(node.level))
		)
			empty.push(keyOf(node));
	}
	const journal = journalPlan(db, cutoff, max);
	debug("Scan done", {
		event: "scan",
		problems: problems.length,
		indexed,
		live,
		invalid: invalid.length,
		empty: empty.length,
		journal,
	});
	return { problems, indexed, live, invalid, empty, journal };
}

/**
 * @purpose Read each problem of the database file.
 * @returns The problem texts. The list is empty after the word ok.
 */
function quickCheck(db: DatabaseSync): readonly string[] {
	return db
		.prepare("PRAGMA quick_check")
		.all()
		.map((row) => String(row.quick_check))
		.filter((text) => text !== "ok");
}

/** @purpose Run one count statement and give its number. */
function count(db: DatabaseSync, sql: string): number {
	return Number(db.prepare(sql).get()?.c ?? 0);
}

/**
 * @purpose Count the journal rows that the age limit and the row limit remove.
 * @invariants The row limit keeps the newest rows of the remaining set.
 */
function journalPlan(db: DatabaseSync, cutoff: string, max: number): number {
	const stale = db
		.prepare("SELECT count(*) AS c FROM journal WHERE at < ?")
		.get(cutoff);
	const stored = db
		.prepare("SELECT count(*) AS c FROM journal WHERE at >= ?")
		.get(cutoff);
	const old = Number(stale?.c ?? 0);
	const kept = Number(stored?.c ?? 0);
	return old + Math.max(0, kept - max);
}

/** @purpose Give the primary key of one node row. */
function keyOf(node: Node): NodeKey {
	return { scope: node.scope, level: node.level, start: node.start };
}

/**
 * @purpose Delete each named node row.
 * @returns The count of deleted rows.
 */
function deleteNodes(db: DatabaseSync, keys: readonly NodeKey[]): number {
	const stmt = db.prepare(
		"DELETE FROM nodes WHERE scope = ? AND level = ? AND start = ?",
	);
	let total = 0;
	for (const key of keys)
		total += Number(stmt.run(key.scope, key.level, key.start).changes);
	return total;
}

/**
 * @purpose Rebuild the index from the live notes, so each drift direction goes.
 * @invariants The delete-all command needs no old text, so a stray index row also goes.
 */
function rebuildIndex(db: DatabaseSync): void {
	db.exec("INSERT INTO fts(fts) VALUES('delete-all')");
	db.exec(
		"INSERT INTO fts(rowid, body, longform) SELECT n, body, longform FROM notes WHERE state = 'live' AND cleared = 0",
	);
}

/**
 * @purpose Delete the journal rows past the age limit and the row limit.
 * @returns The count of deleted rows.
 */
function pruneJournal(db: DatabaseSync, cutoff: string, max: number): number {
	const old = db.prepare("DELETE FROM journal WHERE at < ?").run(cutoff);
	const extra = db
		.prepare(
			"DELETE FROM journal WHERE seq NOT IN (SELECT seq FROM journal ORDER BY seq DESC LIMIT ?)",
		)
		.run(max);
	return Number(old.changes) + Number(extra.changes);
}
