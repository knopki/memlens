/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the transfer text, the five merge channels, and the convergence of two stores.
 * @scope Export and import into real SQLite stores, raw SQL fixtures, and the redaction bytes.
 * @invariants Each test builds its own store directory and removes it at the end.
 * @keywords test, transfer, jsonl, merge, digest, tombstone, convergence
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterAll, describe, it } from "vitest";
import { formatVersion } from "../src/store/clock.js";
import { insertSlot } from "../src/store/slots.js";
import { Store } from "../src/store/store.js";
import { exportLines, importLines } from "../src/store/transfer.js";
import { MemlensError } from "../src/types/errors.js";

const dirs: string[] = [];

const stores: Store[] = [];

const storePaths = new Map<Store, string>();

afterAll(() => {
	for (const store of stores) store.close();
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** @purpose Create one real store and keep it for the teardown. */
function makeStore(): Store {
	const dir = mkdtempSync(join(tmpdir(), "memlens-transfer-"));
	dirs.push(dir);
	const store = new Store(dir, "en");
	stores.push(store);
	storePaths.set(store, dir);
	return store;
}

/** @purpose Give one fixture a valid version text. */
function version(tick: number, store = "fixture-store"): string {
	return formatVersion({
		physical: 1_700_000_000_000 + tick,
		counter: 0,
		store,
	});
}

/** @purpose Set the stored clock text of a fixture store. */
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

/** @purpose Dump each note row as a plain object in id order. */
function dump(store: Store): Record<string, unknown>[] {
	return store
		.handle()
		.prepare("SELECT * FROM notes ORDER BY id")
		.all()
		.map((row) => ({ ...row }));
}

/** @purpose Remove the rowid and the local slot from each dumped row. */
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
 * @invariants A bad format, a bad digest, and a repeated id each raise a data error.
 */
describe("file validation", () => {
	/** @purpose Close one file with a fresh count and digest. */
	function seal(header: string, notes: readonly string[]): string[] {
		const digest = createHash("sha256")
			.update([header, ...notes].join("\n"))
			.digest("hex");
		return [header, ...notes, JSON.stringify({ count: notes.length, digest })];
	}

	it("refuses another format number", () => {
		const file = [JSON.stringify({ format: 2 }), JSON.stringify({ count: 0 })];
		assert.throws(
			() => importLines(makeStore(), file),
			(error) => error instanceof MemlensError && error.code === "Data",
		);
	});

	it("refuses a digest that does not match", () => {
		const source = makeStore();
		addNote(source.handle(), {
			id: "n1",
			ts: "2026-01-01T00:00:00.000Z",
			body: "alpha",
			v: version(1),
		});
		const file = exportLines(source);
		const note = JSON.parse(file[1] ?? "{}");
		note.body = "tampered";
		file[1] = JSON.stringify(note);
		assert.throws(
			() => importLines(makeStore(), file),
			(error) => error instanceof MemlensError && error.code === "Data",
		);
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
		const repeated = seal(file[0] ?? "", [note, note]);
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

	it("clears a locally amended row and removes the marker bytes", () => {
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
		const path = join(storePaths.get(target) ?? "", "memlens.db");
		const bytes = readFileSync(path).toString("latin1");
		let log = "";
		try {
			log = readFileSync(`${path}-wal`).toString("latin1");
		} catch {
			log = "";
		}
		assert.equal(
			bytes.includes(marker) || log.includes(marker),
			false,
			`marker survived: db=${bytes.includes(marker)} wal=${log.includes(marker)}`,
		);
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
