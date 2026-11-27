/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the transfer text, the five merge channels, the slot plan of one import, and the convergence of two stores.
 * @scope Export and import into real SQLite stores and raw SQL fixtures.
 * @invariants Each test builds its own store directory and removes it at the end.
 * @invariants The differential case replays the row-by-row write as the reference.
 * @keywords test, transfer, jsonl, merge, tombstone, convergence, slot, plan
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterAll, describe, it } from "vitest";
import { formatVersion } from "../src/store/clock.js";
import { nullable } from "../src/store/rows.js";
import { insertSlot } from "../src/store/slots.js";
import { Store } from "../src/store/store.js";
import {
	exportLines,
	type ImportResult,
	importLines,
} from "../src/store/transfer.js";
import {
	type LocalRow,
	parseTransfer,
	type Row,
	refsOfRow,
	rowLine,
} from "../src/store/transfer-format.js";
import { mergeRow } from "../src/store/transfer-merge.js";
import { MemlensError } from "../src/types/errors.js";

const dirs: string[] = [];

const stores: Store[] = [];

afterAll(() => {
	for (const store of stores) store.close();
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function makeStore(): Store {
	const dir = mkdtempSync(join(tmpdir(), "memlens-transfer-"));
	dirs.push(dir);
	const store = new Store(dir, "en");
	stores.push(store);
	return store;
}

function version(tick: number, store = "fixture-store"): string {
	return formatVersion({
		physical: 1_700_000_000_000 + tick,
		counter: 0,
		store,
	});
}

function setClock(store: Store, value: string): void {
	store
		.handle()
		.prepare(
			"INSERT INTO meta (key, value) VALUES ('clock', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
		)
		.run(value);
}

/** The fields of one raw SQL fixture note. */
interface Fixture {
	id: string;
	ts: string;
	scope?: string;
	state?: "live" | "hidden" | "deleted";
	cleared?: boolean;
	kind?: string;
	body?: string;
	longform?: string | null;
	refs?: string[];
	superseded_by?: string | null;
	session?: string;
	turn?: string;
	preset?: string;
	review_at?: string | null;
	reviewed_at?: string | null;
	created_at?: string;
	modified_at?: string;
	v: string;
	v_content?: string;
	v_review?: string | null;
}

const INSERT_NOTE = `INSERT INTO notes
	(id, scope, pos, state, cleared, kind, body, longform, refs, superseded_by, ts,
	 created_at, modified_at, review_at, reviewed_at, session, turn, preset, v, v_content, v_review)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const UPDATE_NOTE = `UPDATE notes
	SET scope = ?, state = ?, cleared = ?, kind = ?, body = ?, longform = ?, refs = ?,
	    superseded_by = ?, ts = ?, created_at = ?, modified_at = ?, review_at = ?, reviewed_at = ?,
	    session = ?, turn = ?, preset = ?, v = ?, v_content = ?, v_review = ?, pos = ?
	WHERE id = ?`;

// #region FUNC_test_addNote
/**
 * @purpose Insert one raw note row with its index row, as the write path would.
 * @invariants A live row without cleared content enters the index.
 */
function addNote(db: DatabaseSync, fixture: Fixture): void {
	const scope = fixture.scope ?? "p:x";
	const state = fixture.state ?? "live";
	const cleared = fixture.cleared ?? false;
	const pos = insertSlot(db, scope, fixture.ts, fixture.id);
	db.prepare(INSERT_NOTE).run(
		fixture.id,
		scope,
		pos,
		state,
		cleared ? 1 : 0,
		fixture.kind ?? "note",
		fixture.body ?? "",
		fixture.longform ?? null,
		JSON.stringify(fixture.refs ?? []),
		fixture.superseded_by ?? null,
		fixture.ts,
		fixture.created_at ?? fixture.ts,
		fixture.modified_at ?? fixture.ts,
		fixture.review_at ?? null,
		fixture.reviewed_at ?? null,
		fixture.session ?? "",
		fixture.turn ?? "",
		fixture.preset ?? "",
		fixture.v,
		fixture.v_content ?? fixture.v,
		fixture.v_review ?? null,
	);
	if (state === "live" && !cleared) {
		const row = db.prepare("SELECT n FROM notes WHERE id = ?").get(fixture.id);
		db.prepare("INSERT INTO fts (rowid, body, longform) VALUES (?, ?, ?)").run(
			Number(row?.n ?? 0),
			fixture.body ?? "",
			fixture.longform ?? null,
		);
	}
}
// #endregion FUNC_test_addNote

function dump(store: Store): Record<string, unknown>[] {
	return store
		.handle()
		.prepare("SELECT * FROM notes ORDER BY id")
		.all()
		.map((row) => ({ ...row }));
}

function withoutLocal(
	rows: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
	return rows.map(({ n, pos, ...rest }) => rest);
}

// #region FUNC_test_exportImport
/**
 * @purpose Prove that one export reproduces each note row and that a repeat import changes nothing.
 */
describe("transfer of a full store", () => {
	it("reproduces the rows of an empty store", () => {
		const source = makeStore();
		const target = makeStore();
		const db = source.handle();
		addNote(db, {
			id: "a1",
			ts: "2026-01-01T00:00:00.000Z",
			scope: "p:x",
			kind: "fact",
			body: "alpha body",
			longform: "alpha longform",
			refs: ["r1", "r2"],
			session: "sess-1",
			turn: "turn-1",
			preset: "preset-1",
			review_at: "2026-02-01T00:00:00.000Z",
			v: version(1),
		});
		addNote(db, {
			id: "a2",
			ts: "2026-01-02T00:00:00.000Z",
			scope: "p:x",
			state: "hidden",
			body: "hidden body",
			v: version(2),
		});
		addNote(db, {
			id: "a3",
			ts: "2026-01-03T00:00:00.000Z",
			scope: "p:x",
			state: "deleted",
			cleared: true,
			body: "",
			v: version(4),
			v_content: version(3),
		});
		addNote(db, {
			id: "b1",
			ts: "2026-01-01T00:00:00.000Z",
			scope: "p:y",
			body: "second scope",
			v: version(5),
		});
		setClock(source, version(5));
		const lines = exportLines(source);
		assert.equal(lines.length, 5);
		const result = importLines(target, lines);
		assert.equal(result.applied, 4);
		assert.equal(result.merged, 0);
		const copied = dump(target);
		assert.deepEqual(
			copied.map((row) => row.id),
			["a1", "a2", "a3", "b1"],
		);
		assert.deepEqual(
			copied.map((row) => row.state),
			["live", "hidden", "deleted", "live"],
		);
		assert.deepEqual(
			copied.map((row) => row.body),
			["alpha body", "hidden body", "", "second scope"],
		);
		assert.deepEqual(
			dump(source).map(({ n, ...rest }) => rest),
			dump(target).map(({ n, ...rest }) => rest),
		);
	});

	it("changes no note row on a second import of the same file", () => {
		const source = makeStore();
		const target = makeStore();
		const db = source.handle();
		addNote(db, {
			id: "a1",
			ts: "2026-01-01T00:00:00.000Z",
			body: "alpha",
			v: version(1),
		});
		addNote(db, {
			id: "a2",
			ts: "2026-01-02T00:00:00.000Z",
			body: "beta",
			v: version(2),
		});
		setClock(source, version(2));
		const lines = exportLines(source);
		importLines(target, lines);
		const before = dump(target);
		const result = importLines(target, lines);
		const after = dump(target);
		assert.equal(result.applied, 0);
		assert.equal(result.merged, 0);
		assert.equal(result.lost, 0);
		assert.equal(result.keptLocal, 0);
		assert.deepEqual(after, before);
	});
});
// #endregion FUNC_test_exportImport

// #region FUNC_test_validation
/**
 * @purpose Prove that a malformed file fails before the store writes one row.
 * @invariants A bad format, an invalid note, and a repeated id each raise a data error.
 */
describe("file validation", () => {
	it("refuses another format number", () => {
		const file = [JSON.stringify({ format: 2 })];
		assert.throws(
			() => importLines(makeStore(), file),
			(error) => error instanceof MemlensError && error.code === "Data",
		);
	});

	it("imports an empty store from its header alone", () => {
		const file = exportLines(makeStore());
		assert.equal(file.length, 1);
		assert.equal(JSON.parse(file[0] ?? "{}").format, 1);
		const target = makeStore();
		const result = importLines(target, file);
		assert.equal(result.applied, 0);
		assert.deepEqual(dump(target), []);
	});

	it("refuses a file without a header", () => {
		assert.throws(
			() => importLines(makeStore(), []),
			/The transfer file has no header\./,
		);
	});

	it("imports an edited scope when its content version wins", () => {
		const store = makeStore();
		addNote(store.handle(), {
			id: "n1",
			ts: "2026-01-01T00:00:00.000Z",
			body: "alpha",
			v: version(1),
		});
		const file = exportLines(store);
		const note = JSON.parse(file[1] ?? "{}");
		note.scope = "p:destination";
		note.v = version(2);
		note.v_content = version(2);
		file[1] = JSON.stringify(note);
		assert.equal(importLines(store, file).merged, 1);
		const [row] = dump(store);
		assert.equal(row?.id, "n1");
		assert.equal(row?.scope, "p:destination");
		assert.equal(row?.body, "alpha");
	});

	it("refuses an invalid final note before any write", () => {
		const source = makeStore();
		addNote(source.handle(), {
			id: "n1",
			ts: "2026-01-01T00:00:00.000Z",
			body: "alpha",
			v: version(1),
		});
		const file = exportLines(source);
		file.push("{");
		const target = makeStore();
		assert.throws(
			() => importLines(target, file),
			/The transfer note is not JSON\./,
		);
		assert.deepEqual(dump(target), []);
	});

	it("refuses a repeated id inside one file", () => {
		const source = makeStore();
		addNote(source.handle(), {
			id: "n1",
			ts: "2026-01-01T00:00:00.000Z",
			body: "alpha",
			v: version(1),
		});
		const file = exportLines(source);
		const note = file[1] ?? "{}";
		const repeated = [file[0] ?? "", note, note];
		assert.throws(
			() => importLines(makeStore(), repeated),
			(error) => error instanceof MemlensError && error.code === "Data",
		);
	});
});
// #endregion FUNC_test_validation

// #region FUNC_test_clock
/**
 * @purpose Prove that a local write after an import outranks each imported version.
 * @invariants A far future incoming version raises the stored clock text.
 */
describe("clock receive", () => {
	it("keeps a local write above a far future imported version", () => {
		const source = makeStore();
		const target = makeStore();
		const far = formatVersion({
			physical: 9_999_999_999_999,
			counter: 0,
			store: "remote-store",
		});
		addNote(source.handle(), {
			id: "n1",
			ts: "2026-01-01T00:00:00.000Z",
			body: "future version",
			v: far,
		});
		setClock(source, far);
		importLines(target, exportLines(source));
		assert.equal(target.meta("clock"), far);
		const local = target.publish((tx) => tx.journal("test", null, null));
		assert.ok(local.version > far, `${local.version} > ${far}`);
	});
});
// #endregion FUNC_test_clock

// #region FUNC_test_channels
/**
 * @purpose Prove each merge channel against a divergent local row.
 * @invariants Lifecycle never returns to live. The cleared latch clears the content.
 */
describe("merge channels", () => {
	it("does not unhide a local hidden row from an old live export", () => {
		const source = makeStore();
		const target = makeStore();
		addNote(source.handle(), {
			id: "n1",
			ts: "2026-01-01T00:00:00.000Z",
			body: "old live",
			v: version(1),
		});
		addNote(target.handle(), {
			id: "n1",
			ts: "2026-01-01T00:00:00.000Z",
			state: "hidden",
			body: "local hidden",
			v: version(9),
		});
		setClock(source, version(1));
		importLines(target, exportLines(source));
		const row = target
			.handle()
			.prepare("SELECT state, body FROM notes WHERE id = 'n1'")
			.get();
		assert.equal(row?.state, "hidden");
		assert.equal(row?.body, "local hidden");
	});

	it("clears a locally amended row", () => {
		const source = makeStore();
		const target = makeStore();
		const marker = "transfer-canary-marker-zzq-42";
		addNote(source.handle(), {
			id: "n1",
			ts: "2026-01-01T00:00:00.000Z",
			state: "deleted",
			cleared: true,
			body: "",
			v: version(4),
			v_content: version(3),
		});
		addNote(target.handle(), {
			id: "n1",
			ts: "2026-01-01T00:00:00.000Z",
			body: marker,
			v: version(9),
			v_content: version(8),
		});
		setClock(source, version(4));
		const result = importLines(target, exportLines(source));
		assert.equal(result.clearedApplied, true);
		const row = target
			.handle()
			.prepare(
				"SELECT state, cleared, body, longform FROM notes WHERE id = 'n1'",
			)
			.get();
		assert.equal(row?.state, "deleted");
		assert.equal(row?.cleared, 1);
		assert.equal(row?.body, "");
		assert.equal(row?.longform, null);
		const hits = target
			.handle()
			.prepare("SELECT rowid FROM fts WHERE fts MATCH 'zzq'")
			.all();
		assert.equal(hits.length, 0);
	});

	it("takes a newer content group and journals the lost local channel", () => {
		const local = makeStore();
		const remote = makeStore();
		addNote(local.handle(), {
			id: "n1",
			ts: "2026-01-01T00:00:00.000Z",
			body: "local body",
			v: version(1),
		});
		addNote(remote.handle(), {
			id: "n1",
			ts: "2026-01-01T00:00:00.000Z",
			body: "incoming body",
			v: version(3),
		});
		setClock(remote, version(3));
		const file = exportLines(remote);
		const dry = importLines(local, file, { dryRun: true });
		assert.deepEqual(dry, {
			applied: 0,
			merged: 1,
			keptLocal: 0,
			lost: 1,
			clearedApplied: false,
		});
		assert.equal(
			local.handle().prepare("SELECT body FROM notes WHERE id = 'n1'").get()
				?.body,
			"local body",
		);
		const real = importLines(local, file);
		assert.equal(real.merged, 1);
		assert.equal(real.lost, 1);
		assert.equal(
			local.handle().prepare("SELECT body FROM notes WHERE id = 'n1'").get()
				?.body,
			"incoming body",
		);
		const facts = local
			.handle()
			.prepare("SELECT op, target, reason FROM journal WHERE op = 'merge_lost'")
			.all();
		assert.equal(facts.length, 1);
		assert.equal(facts[0]?.target, "n1");
		assert.equal(facts[0]?.reason, "content");
	});
});
// #endregion FUNC_test_channels

// #region FUNC_test_convergence
/**
 * @purpose Prove that two stores reach one note state after a full exchange.
 * @invariants Every note field except the local slot and rowid compares equal.
 */
describe("convergence", () => {
	it("joins two divergent stores in both directions", () => {
		const a = makeStore();
		const b = makeStore();
		const dbA = a.handle();
		const dbB = b.handle();
		addNote(dbA, {
			id: "s1",
			ts: "2026-01-01T00:00:00.000Z",
			kind: "fact",
			body: "A one",
			created_at: "2026-01-01T00:00:00.000Z",
			v: version(10, "store-a"),
		});
		addNote(dbB, {
			id: "s1",
			ts: "2026-01-01T00:00:00.000Z",
			kind: "note",
			body: "B one",
			created_at: "2026-01-02T00:00:00.000Z",
			v: version(20, "store-b"),
		});
		addNote(dbA, {
			id: "s2",
			ts: "2026-01-02T00:00:00.000Z",
			state: "hidden",
			body: "A two",
			v: version(30, "store-a"),
		});
		addNote(dbB, {
			id: "s2",
			ts: "2026-01-02T00:00:00.000Z",
			body: "B two",
			v: version(25, "store-b"),
		});
		addNote(dbA, {
			id: "s3",
			ts: "2026-01-03T00:00:00.000Z",
			body: "same three",
			review_at: "2026-03-01T00:00:00.000Z",
			reviewed_at: "2026-02-01T00:00:00.000Z",
			v: version(40, "store-a"),
			v_review: version(50, "store-a"),
		});
		addNote(dbB, {
			id: "s3",
			ts: "2026-01-03T00:00:00.000Z",
			body: "same three",
			review_at: "2026-04-01T00:00:00.000Z",
			reviewed_at: "2026-03-15T00:00:00.000Z",
			v: version(40, "store-a"),
			v_review: version(60, "store-b"),
		});
		addNote(dbA, {
			id: "s4",
			ts: "2026-01-04T00:00:00.000Z",
			body: "amended A",
			v: version(30, "store-a"),
		});
		addNote(dbB, {
			id: "s4",
			ts: "2026-01-04T00:00:00.000Z",
			state: "deleted",
			cleared: true,
			body: "",
			v: version(10, "store-b"),
		});
		addNote(dbA, {
			id: "s5",
			ts: "2026-01-05T00:00:00.000Z",
			scope: "p:one",
			body: "moved A",
			v: version(15, "store-a"),
		});
		addNote(dbB, {
			id: "s5",
			ts: "2026-01-05T00:00:00.000Z",
			scope: "p:two",
			body: "moved B",
			v: version(35, "store-b"),
		});
		addNote(dbA, {
			id: "a1",
			ts: "2025-12-01T00:00:00.000Z",
			body: "only A",
			v: version(5, "store-a"),
		});
		addNote(dbB, {
			id: "b1",
			ts: "2025-12-02T00:00:00.000Z",
			body: "only B",
			v: version(6, "store-b"),
		});
		setClock(a, version(50, "store-a"));
		setClock(b, version(60, "store-b"));
		const fileA = exportLines(a);
		const fileB = exportLines(b);
		importLines(b, fileA);
		importLines(a, fileB);
		assert.deepEqual(withoutLocal(dump(a)), withoutLocal(dump(b)));
	});
});
// #endregion FUNC_test_convergence

// #region FUNC_test_slotPlan
/**
 * @purpose Prove that the slot plan of one import gives each slot that the row-by-row write gives.
 * @invariants Each pinned case names its rows, its slots, and its expected order.
 * @invariants The differential case replays the row-by-row write as the reference, on random rows.
 */
describe("the slot plan of one import", () => {
	it("places an insert after a row whose content win moved its key", () => {
		const store = makeStore();
		seedRows(store.handle(), [
			{ id: "n1", ts: "2026-01-05T00:00:00.000Z", v: version(1) },
			{ id: "n2", ts: "2026-01-09T00:00:00.000Z", v: version(2) },
		]);
		const result = importLines(
			store,
			fileOf([
				{
					id: "n1",
					ts: "2026-01-03T00:00:00.000Z",
					body: "moved key",
					v: version(5),
					v_content: version(5),
				},
				{
					id: "a1",
					ts: "2026-01-07T00:00:00.000Z",
					body: "new",
					v: version(6),
				},
			]),
		);
		assert.equal(result.applied, 1);
		assert.equal(result.merged, 1);
		assert.deepEqual(rowsOf(store), [
			{ id: "n1", ts: "2026-01-03T00:00:00.000Z", pos: 0 },
			{ id: "a1", ts: "2026-01-07T00:00:00.000Z", pos: 1 },
			{ id: "n2", ts: "2026-01-09T00:00:00.000Z", pos: 2 },
		]);
	});

	it("lets a later note take the slot that a move vacated", () => {
		const store = makeStore();
		seedRows(store.handle(), [
			{ id: "m1", ts: "2026-01-05T00:00:00.000Z", v: version(1) },
			{ id: "m2", ts: "2026-01-09T00:00:00.000Z", v: version(2) },
		]);
		importLines(
			store,
			fileOf([
				{
					id: "m2",
					scope: "p:y",
					ts: "2026-01-09T00:00:00.000Z",
					body: "moved out",
					v: version(9),
					v_content: version(9),
				},
				{
					id: "c1",
					ts: "2026-01-12T00:00:00.000Z",
					body: "new tail",
					v: version(7),
				},
			]),
		);
		assert.deepEqual(rowsOf(store, "p:x"), [
			{ id: "m1", ts: "2026-01-05T00:00:00.000Z", pos: 0 },
			{ id: "c1", ts: "2026-01-12T00:00:00.000Z", pos: 1 },
		]);
		assert.deepEqual(rowsOf(store, "p:y"), [
			{ id: "m2", ts: "2026-01-09T00:00:00.000Z", pos: 0 },
		]);
	});

	it("keeps a vacated slot empty when an earlier insert moved the tail", () => {
		const store = makeStore();
		seedRows(store.handle(), [
			{ id: "m1", ts: "2026-01-05T00:00:00.000Z", v: version(1) },
			{ id: "m2", ts: "2026-01-09T00:00:00.000Z", v: version(2) },
		]);
		importLines(
			store,
			fileOf([
				{
					id: "b1",
					ts: "2026-01-07T00:00:00.000Z",
					body: "new middle",
					v: version(3),
				},
				{
					id: "m2",
					scope: "p:y",
					ts: "2026-01-09T00:00:00.000Z",
					body: "moved out",
					v: version(9),
					v_content: version(9),
				},
			]),
		);
		assert.deepEqual(rowsOf(store, "p:x"), [
			{ id: "m1", ts: "2026-01-05T00:00:00.000Z", pos: 0 },
			{ id: "b1", ts: "2026-01-07T00:00:00.000Z", pos: 1 },
		]);
		assert.deepEqual(rowsOf(store, "p:y"), [
			{ id: "m2", ts: "2026-01-09T00:00:00.000Z", pos: 0 },
		]);
	});

	it("gives the row-by-row write on random rows", () => {
		for (let seed = 1; seed <= 25; seed++) {
			const rand = mulberry32(seed);
			const scenario = randomCase(rand, seed);
			const planned = makeStore();
			const reference = makeStore();
			seedRows(planned.handle(), scenario.local, scenario.gappy);
			seedRows(reference.handle(), scenario.local, scenario.gappy);
			const file = fileOf(scenario.incoming);
			const plannedResult = importLines(planned, file);
			const referenceResult = referenceImport(reference, file);
			assert.deepEqual(plannedResult, referenceResult, `seed ${seed}`);
			assert.deepEqual(dump(planned), dump(reference), `seed ${seed}`);
		}
	});
});
// #endregion FUNC_test_slotPlan

// #region FUNC_test_transferRow
/** @purpose Turn one fixture into one complete transfer row. */
function transferRow(fixture: Fixture): Row {
	const v = fixture.v;
	return {
		id: fixture.id,
		scope: (fixture.scope ?? "p:x") as Row["scope"],
		ts: fixture.ts,
		state: fixture.state ?? "live",
		cleared: fixture.cleared ?? false,
		kind: fixture.kind ?? "note",
		body: fixture.body ?? "",
		longform: fixture.longform ?? null,
		refs: fixture.refs ?? [],
		superseded_by: fixture.superseded_by ?? null,
		session: fixture.session ?? "",
		turn: fixture.turn ?? "",
		preset: fixture.preset ?? "",
		review_at: fixture.review_at ?? null,
		reviewed_at: fixture.reviewed_at ?? null,
		created_at: fixture.created_at ?? fixture.ts,
		modified_at: fixture.modified_at ?? fixture.ts,
		v,
		v_content: fixture.v_content ?? v,
		v_review: fixture.v_review ?? null,
	};
}
// #endregion FUNC_test_transferRow

// #region FUNC_test_seedRows
/**
 * @purpose Seed one store with note rows at dense or gapped slots, with their index rows.
 * @invariants The seed assigns each slot by the key rank inside its scope, in any state.
 * @invariants A live row without cleared content enters the index, so a merge may delete its index row.
 */
function seedRows(
	db: DatabaseSync,
	fixtures: readonly Fixture[],
	gappy: boolean,
): void {
	const scoped = new Map<string, Fixture[]>();
	for (const fixture of [...fixtures].sort(byFixtureKey)) {
		const scope = fixture.scope ?? "p:x";
		const group = scoped.get(scope);
		if (group === undefined) scoped.set(scope, [fixture]);
		else group.push(fixture);
	}
	const insert = db.prepare(INSERT_NOTE);
	const index = db.prepare(
		"INSERT INTO fts (rowid, body, longform) VALUES (?, ?, ?)",
	);
	const rowid = db.prepare("SELECT n FROM notes WHERE id = ?");
	for (const [scope, group] of scoped)
		group.forEach((fixture, rank) => {
			const state = fixture.state ?? "live";
			const cleared = fixture.cleared ?? false;
			const longform = fixture.longform ?? null;
			insert.run(
				fixture.id,
				scope,
				gappy ? rank * 2 : rank,
				state,
				cleared ? 1 : 0,
				fixture.kind ?? "note",
				fixture.body ?? "",
				longform,
				JSON.stringify(fixture.refs ?? []),
				fixture.superseded_by ?? null,
				fixture.ts,
				fixture.created_at ?? fixture.ts,
				fixture.modified_at ?? fixture.ts,
				fixture.review_at ?? null,
				fixture.reviewed_at ?? null,
				fixture.session ?? "",
				fixture.turn ?? "",
				fixture.preset ?? "",
				fixture.v,
				fixture.v_content ?? fixture.v,
				fixture.v_review ?? null,
			);
			if (state === "live" && !cleared) {
				const row = rowid.get(fixture.id);
				index.run(Number(row?.n ?? 0), fixture.body ?? "", longform);
			}
		});
}
// #endregion FUNC_test_seedRows

// #region FUNC_test_fileOf
/** @purpose Render one transfer file from raw fixtures. */
function fileOf(fixtures: readonly Fixture[]): string[] {
	const header = JSON.stringify({
		format: 1,
		store: "remote",
		version: version(900, "remote"),
	});
	return [
		header,
		...fixtures.map((fixture) =>
			rowLine({
				...transferRow(fixture),
				refs: JSON.stringify(fixture.refs ?? []),
			} as unknown as Record<string, unknown>),
		),
	];
}
// #endregion FUNC_test_fileOf

// #region FUNC_test_rowsOf
/** @purpose List one scope by slot, with the fields that the plan cases compare. */
function rowsOf(
	store: Store,
	scope = "p:x",
): { id: string; ts: string; pos: number }[] {
	return store
		.handle()
		.prepare("SELECT id, ts, pos FROM notes WHERE scope = ? ORDER BY pos")
		.all(scope)
		.map((row) => ({
			id: String(row.id),
			ts: String(row.ts),
			pos: Number(row.pos),
		}));
}
// #endregion FUNC_test_rowsOf

// #region FUNC_test_referenceImport
/**
 * @purpose Replay the row-by-row write that the import used before the slot plan.
 * @invariants The replay opens each slot with the SQL rank lookup and one SQL tail shift.
 * @returns The counts of the reference run.
 */
function referenceImport(store: Store, file: string[]): ImportResult {
	const parsed = parseTransfer(file);
	const ordered = [...parsed.rows].sort((left, right) => {
		const a = left.row;
		const b = right.row;
		if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
	return store.publish((tx) => {
		const db = tx.db;
		const select = db.prepare("SELECT * FROM notes WHERE id = ?");
		const insert = db.prepare(INSERT_NOTE);
		const update = db.prepare(UPDATE_NOTE);
		const result = {
			applied: 0,
			merged: 0,
			keptLocal: 0,
			lost: 0,
			clearedApplied: false,
		};
		for (const { row, tombstone } of ordered) {
			const local = referenceLocal(select.get(row.id));
			if (local === null) {
				result.applied += 1;
				const next = tombstone
					? {
							...row,
							state: "deleted" as const,
							cleared: true,
							body: "",
							longform: null,
						}
					: row;
				const pos = insertSlot(db, next.scope, next.ts, next.id);
				insert.run(
					next.id,
					next.scope,
					pos,
					next.state,
					next.cleared ? 1 : 0,
					next.kind,
					next.body,
					next.longform,
					JSON.stringify(next.refs),
					next.superseded_by,
					next.ts,
					next.created_at,
					next.modified_at,
					next.review_at,
					next.reviewed_at,
					next.session,
					next.turn,
					next.preset,
					next.v,
					next.v_content,
					next.v_review,
				);
				if (next.cleared) result.clearedApplied = true;
				continue;
			}
			const decision = mergeRow(local, row);
			if (decision.merged.cleared && !local.cleared)
				result.clearedApplied = true;
			if (!decision.changed) continue;
			const merged = decision.merged;
			let pos = local.pos;
			if (merged.scope !== local.scope)
				pos = insertSlot(db, merged.scope, merged.ts, merged.id);
			update.run(
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
			result.merged += 1;
			if (decision.contentKept) result.keptLocal += 1;
			if (decision.contentLost) result.lost += 1;
			if (decision.reviewKept) result.keptLocal += 1;
			if (decision.reviewLost) result.lost += 1;
		}
		return result;
	}).value;
}
// #endregion FUNC_test_referenceImport

// #region FUNC_test_referenceLocal
/** @purpose Read one local row for the reference, with the shape that the merge reads. */
function referenceLocal(
	row: Record<string, unknown> | undefined,
): LocalRow | null {
	if (row === undefined) return null;
	return {
		n: Number(row.n),
		pos: Number(row.pos),
		id: String(row.id),
		scope: String(row.scope) as LocalRow["scope"],
		ts: String(row.ts),
		state: String(row.state) as LocalRow["state"],
		cleared: Number(row.cleared) === 1,
		kind: String(row.kind) as LocalRow["kind"],
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
// #endregion FUNC_test_referenceLocal

// #region FUNC_test_randomCase
/**
 * @purpose Build one random import case: local rows, incoming rows, and a slot gap flag.
 * @invariants An incoming row for a local id wins the content channel, wins the review channel, or
 * arrives as a tombstone.
 */
function randomCase(
	rand: () => number,
	seed: number,
): { local: Fixture[]; incoming: Fixture[]; gappy: boolean } {
	const scopes = ["p:x", "p:y"];
	const local: Fixture[] = [];
	const localCount = Math.floor(rand() * 20);
	for (let i = 0; i < localCount; i++)
		local.push({
			id: `l${i}`,
			ts: moment(Math.floor(rand() * 40)),
			scope: scopes[Math.floor(rand() * scopes.length)],
			state: rand() < 0.2 ? "hidden" : "live",
			body: `local ${i}`,
			v: version(1000 + i),
		});
	const incoming: Fixture[] = [];
	const incomingCount = Math.floor(rand() * 20);
	const used = new Set<string>();
	for (let i = 0; i < incomingCount; i++) {
		const reuse = localCount > 0 && rand() < 0.5;
		const picked = reuse ? `l${Math.floor(rand() * localCount)}` : null;
		const id = picked !== null && !used.has(picked) ? picked : `n${i}`;
		used.add(id);
		const target = local.find((fixture) => fixture.id === id);
		const kind = rand();
		if (!reuse || target === undefined || kind < 0.5) {
			incoming.push({
				id,
				ts: moment(Math.floor(rand() * 40)),
				scope: scopes[Math.floor(rand() * scopes.length)],
				state: rand() < 0.15 ? "hidden" : "live",
				body: `incoming ${seed}-${i}`,
				v: version(2000 + i, "remote"),
			});
			continue;
		}
		if (kind < 0.75) {
			incoming.push({
				id,
				ts: moment(Math.floor(rand() * 40)),
				scope: scopes[Math.floor(rand() * scopes.length)],
				body: `amended ${seed}-${i}`,
				v: version(3000 + i, "remote"),
				v_content: version(3000 + i, "remote"),
			});
			continue;
		}
		if (kind < 0.9) {
			incoming.push({
				id,
				ts: target.ts,
				scope: target.scope,
				body: target.body,
				v: target.v,
				v_content: target.v_content,
				v_review: version(4000 + i, "remote"),
				review_at: "2026-06-01T00:00:00.000Z",
			});
			continue;
		}
		incoming.push({
			id,
			ts: moment(Math.floor(rand() * 40)),
			scope: target.scope,
			state: "deleted",
			cleared: true,
			v: version(5000 + i, "remote"),
			v_content: version(5000 + i, "remote"),
		});
	}
	return { local, incoming, gappy: rand() < 0.5 };
}
// #endregion FUNC_test_randomCase

function moment(day: number): string {
	return new Date(Date.UTC(2026, 0, 1, 0, day, 0, 0)).toISOString();
}

function byFixtureKey(left: Fixture, right: Fixture): number {
	if (left.ts !== right.ts) return left.ts < right.ts ? -1 : 1;
	return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

// #region FUNC_test_mulberry32
/** @purpose Give one deterministic random stream for one seed. */
function mulberry32(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
// #endregion FUNC_test_mulberry32
