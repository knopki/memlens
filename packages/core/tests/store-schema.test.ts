/**
 * Tests of the store clock, the schema, and the schema migration.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the clock order, the schema invariants, and the migration steps under the real SQLite engine.
 * @scope The clock rules, the open, the meta rows, the index flavor, the migration steps, and the kind check.
 * @keywords test, clock, schema, migration, version, kind
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, it } from "vitest";
import { formatVersion, parseVersion, tick } from "../src/store/clock.js";
import { openDatabase, SCHEMA_VERSION } from "../src/store/schema.js";
import { MemlensError } from "../src/types/errors.js";

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function storePath(): string {
	const dir = mkdtempSync(join(tmpdir(), "memlens-"));
	dirs.push(dir);
	return join(dir, "memlens.db");
}

function tables(db: DatabaseSync): string[] {
	return db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
		)
		.all()
		.map((row) => String(row.name));
}

function version(db: DatabaseSync): string | undefined {
	const row = db
		.prepare("SELECT value FROM meta WHERE key = 'schema_version'")
		.get();
	return row === undefined ? undefined : String(row.value);
}

function bodies(db: DatabaseSync): string[] {
	return db
		.prepare("SELECT body FROM notes ORDER BY n")
		.all()
		.map((row) => String(row.body));
}

function addNote(db: DatabaseSync, pos: number, body: string): void {
	db.prepare(
		"INSERT INTO notes (id, scope, pos, state, kind, body, ts, created_at, modified_at, v, v_content) VALUES (?, 'p:x', ?, 'live', 'note', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'a', 'a')",
	).run(`note-${pos}`, pos, body);
	const n = Number(db.prepare("SELECT last_insert_rowid() AS n").get()?.n ?? 0);
	db.prepare("INSERT INTO fts (rowid, body, longform) VALUES (?, ?, NULL)").run(
		n,
		body,
	);
}

function schemaOf(db: DatabaseSync): string[] {
	return db
		.prepare(
			"SELECT name, type, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name, type",
		)
		.all()
		.map(
			(row) =>
				`${String(row.type)} ${String(row.name)}: ${String(row.sql).replace(/\s+/g, " ")}`,
		);
}

function versionRefused(error: unknown): boolean {
	return (
		error instanceof MemlensError &&
		error.code === "Data" &&
		/version/i.test(error.message)
	);
}

// #region FUNC_test_clock
/**
 * @purpose Prove that a local write outranks each version that the store has seen.
 * @invariants A backward clock jump changes no order. Equal physical time still gives a greater version.
 */
describe("clock", () => {
	it("orders a local write above a received version with a later wall clock", () => {
		const store = { physical: 0, counter: 0, store: "aaa" };
		const remote = formatVersion({
			physical: 9_999_999_999_999,
			counter: 0,
			store: "zzz",
		});
		const local = tick(parseVersion(remote) ?? store, 1_500);
		assert.ok(local.version > remote, `${local.version} > ${remote}`);
	});

	it("keeps the order after a backward clock jump", () => {
		const store = { physical: 0, counter: 0, store: "aaa" };
		const first = tick(store, 5_000);
		const second = tick(first.state, 1_000);
		assert.ok(second.version > first.version);
	});

	it("reads its own output", () => {
		const state = { physical: 1_700_000_000_000, counter: 7, store: "s" };
		assert.deepEqual(parseVersion(formatVersion(state)), state);
	});
});
// #endregion FUNC_test_clock

// #region FUNC_test_schema
/**
 * @purpose Prove the schema of a new store and the index flavor.
 */
describe("schema", () => {
	it("creates each table and the meta rows", () => {
		const db = openDatabase(storePath(), "en");
		const names = tables(db);
		for (const table of ["meta", "notes", "nodes", "proposals", "journal"]) {
			assert.ok(names.includes(table), `missing ${table}`);
		}
		assert.equal(version(db), String(SCHEMA_VERSION));
		assert.equal(db.prepare("PRAGMA secure_delete").get()?.secure_delete, 1);
		db.close();
	});

	it("keeps a fresh store at the baseline version across a reopen", () => {
		const path = storePath();
		const first = openDatabase(path, "en");
		addNote(first, 0, "kept across the open");
		const store = first
			.prepare("SELECT value FROM meta WHERE key = 'store_id'")
			.get()?.value;
		first.close();
		const second = openDatabase(path, "en");
		assert.equal(version(second), String(SCHEMA_VERSION));
		assert.deepEqual(bodies(second), ["kept across the open"]);
		assert.equal(
			second.prepare("SELECT value FROM meta WHERE key = 'store_id'").get()
				?.value,
			store,
		);
		second.close();
	});

	it("rebuilds the index when the language key names another tokenizer", () => {
		const path = storePath();
		const first = openDatabase(path, "en");
		addNote(first, 0, "東京の会議");
		first.close();
		const second = openDatabase(path, "zh");
		const tokenizer = second
			.prepare("SELECT value FROM meta WHERE key = 'fts_tokenizer'")
			.get()?.value;
		assert.match(String(tokenizer), /trigram/);
		const hits = second
			.prepare("SELECT rowid FROM fts WHERE fts MATCH ?")
			.all("東京の");
		assert.equal(hits.length, 1, "the rebuilt index holds the stored note");
		second.close();
	});
});
// #endregion FUNC_test_schema

// #region FUNC_test_migration
/**
 * @purpose Prove each migration step and the refusal of a store of an unknown version.
 * @invariants A step sees the version that the step before it wrote. A failed step leaves no change.
 */
describe("migration", () => {
	it("applies the steps when it creates a new store", () => {
		const db = openDatabase(storePath(), "en", [
			(step: DatabaseSync) => step.exec("CREATE TABLE test_change (id TEXT)"),
		]);
		assert.equal(version(db), "3");
		assert.equal(tables(db).includes("test_change"), true);
		db.close();
	});

	it("applies each step in order and keeps the rows", () => {
		const path = storePath();
		const db = openDatabase(path, "en", []);
		addNote(db, 0, "first fact");
		addNote(db, 1, "second fact");
		const store = db
			.prepare("SELECT value FROM meta WHERE key = 'store_id'")
			.get()?.value;
		const notes = db
			.prepare("SELECT id, scope, pos, body FROM notes ORDER BY pos")
			.all();
		db.close();
		const seen: Array<string | undefined> = [];
		const migrations = [
			(step: DatabaseSync) => {
				seen.push(version(step));
				step.exec("ALTER TABLE notes ADD COLUMN tag TEXT NOT NULL DEFAULT ''");
			},
			(step: DatabaseSync) => {
				seen.push(version(step));
				step.exec("UPDATE notes SET tag = 'kept'");
				step.exec("CREATE TABLE tags (name TEXT PRIMARY KEY)");
			},
		];
		const upgraded = openDatabase(path, "en", migrations);
		assert.deepEqual(seen, ["2", "3"]);
		assert.equal(version(upgraded), "4");
		assert.deepEqual(
			upgraded
				.prepare("SELECT id, scope, pos, body FROM notes ORDER BY pos")
				.all(),
			notes,
		);
		assert.deepEqual(
			upgraded
				.prepare("SELECT tag FROM notes ORDER BY n")
				.all()
				.map((row) => String(row.tag)),
			["kept", "kept"],
		);
		assert.equal(tables(upgraded).includes("tags"), true);
		upgraded.close();

		const reopened = openDatabase(path, "en", migrations);
		assert.equal(version(reopened), "4");
		assert.deepEqual(bodies(reopened), ["first fact", "second fact"]);
		assert.equal(
			reopened.prepare("SELECT value FROM meta WHERE key = 'store_id'").get()
				?.value,
			store,
		);
		assert.deepEqual(seen, ["2", "3"]);
		reopened.close();
	});

	it("rolls back every applied step when a step fails", () => {
		const path = storePath();
		const db = openDatabase(path, "en", []);
		addNote(db, 0, "keep me");
		db.close();
		const boom = new Error("step two failed");
		const migrations = [
			(step: DatabaseSync) => {
				step.exec("CREATE TABLE first_step (k TEXT PRIMARY KEY)");
				step.exec("ALTER TABLE notes ADD COLUMN tag TEXT NOT NULL DEFAULT ''");
			},
			() => {
				throw boom;
			},
		];
		assert.throws(
			() => openDatabase(path, "en", migrations),
			(error: unknown) => error === boom,
		);
		const restored = openDatabase(path, "en", []);
		assert.equal(version(restored), "2");
		assert.equal(tables(restored).includes("first_step"), false);
		assert.throws(
			() => restored.prepare("SELECT tag FROM notes").get(),
			/no such column/i,
		);
		assert.deepEqual(bodies(restored), ["keep me"]);
		restored.close();

		const retried = openDatabase(path, "en", [
			(step: DatabaseSync) =>
				step.exec("CREATE TABLE first_step (k TEXT PRIMARY KEY)"),
		]);
		assert.equal(version(retried), "3");
		assert.equal(tables(retried).includes("first_step"), true);
		retried.close();
	});

	it("widens the kind check and keeps each row with its index row", () => {
		const path = storePath();
		const db = openDatabase(path, "en", []);
		assert.equal(version(db), "2");
		addNote(db, 0, "the first fact");
		addNote(db, 1, "the second fact");
		const slots = db
			.prepare("SELECT n, id, pos, kind, body FROM notes ORDER BY pos")
			.all();
		db.close();

		const upgraded = openDatabase(path, "en");
		assert.equal(version(upgraded), String(SCHEMA_VERSION));
		assert.deepEqual(
			upgraded
				.prepare("SELECT n, id, pos, kind, body FROM notes ORDER BY pos")
				.all(),
			slots,
		);
		// The step leaves no extra table, and the schema matches a store of a newer build.
		assert.deepEqual(
			schemaOf(upgraded),
			schemaOf(openDatabase(`${path}.fresh`, "en")),
		);
		// The open sets the journal mode before the schema work, so a rename step leaves no lock.
		assert.equal(
			upgraded.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get()?.busy,
			0,
		);

		// The search index still points at the row, because the step keeps `n`.
		const second = Number(slots[1]?.n);
		assert.deepEqual(
			upgraded
				.prepare("SELECT rowid FROM fts WHERE fts MATCH 'second'")
				.all()
				.map((row) => Number(row.rowid)),
			[second],
		);

		const write = upgraded.prepare(
			"INSERT INTO notes (id, scope, pos, state, kind, body, ts, created_at, modified_at, v, v_content) VALUES (?, 'p:x', ?, 'live', ?, 'a body', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'a', 'a')",
		);
		write.run("note-gotcha", 2, "gotcha");
		assert.equal(
			upgraded.prepare("SELECT kind FROM notes WHERE id = 'note-gotcha'").get()
				?.kind,
			"gotcha",
		);
		assert.throws(() => write.run("note-unknown", 3, "rumour"), /constraint/i);
		upgraded.close();
	});

	it("indexes the expiry of each open proposal on an old store", () => {
		const path = storePath();
		const db = openDatabase(path, "en", []);
		addNote(db, 0, "kept fact");
		// An old store holds the schema before this step, so it has no expiry index.
		db.exec("DROP INDEX proposals_expiry");
		db.close();

		const upgraded = openDatabase(path, "en");
		assert.equal(version(upgraded), String(SCHEMA_VERSION));
		const index = upgraded
			.prepare("SELECT sql FROM sqlite_master WHERE name = 'proposals_expiry'")
			.get();
		assert.match(
			String(index?.sql ?? ""),
			/ON proposals \(expires_at\) WHERE closed = 0/,
		);
		// The sweep check reads the index, not the table.
		const plan = upgraded
			.prepare(
				"EXPLAIN QUERY PLAN SELECT id FROM proposals WHERE closed = 0 AND expires_at <= ? LIMIT 1",
			)
			.get("2026-01-01T00:00:00.000Z");
		assert.match(String(plan?.detail ?? ""), /proposals_expiry/);
		upgraded.close();
	});

	it("refuses a newer and a malformed version at open before the schema work", () => {
		for (const stored of ["1", "99", "two", "missing"]) {
			const path = storePath();
			const db = openDatabase(path, "en", []);
			addNote(db, 0, "written by the older build");
			db.exec("DROP TABLE proposals");
			db.exec("PRAGMA journal_mode = DELETE");
			if (stored === "missing") {
				db.prepare("DELETE FROM meta WHERE key = 'schema_version'").run();
			} else {
				db.prepare(
					"UPDATE meta SET value = ? WHERE key = 'schema_version'",
				).run(stored);
			}
			db.close();
			let ran = false;
			assert.throws(
				() =>
					openDatabase(path, "en", [
						() => {
							ran = true;
						},
					]),
				versionRefused,
				`version ${stored}`,
			);
			assert.equal(ran, false);

			// The refused open creates no table and loses no row.
			const reopened = new DatabaseSync(path);
			assert.equal(tables(reopened).includes("proposals"), false);
			assert.equal(
				reopened.prepare("PRAGMA journal_mode").get()?.journal_mode,
				"delete",
			);
			assert.equal(
				version(reopened),
				stored === "missing" ? undefined : stored,
			);
			assert.deepEqual(bodies(reopened), ["written by the older build"]);
			reopened.close();
		}
	});

	it("refuses a database that holds tables but no meta", () => {
		const path = storePath();
		const raw = new DatabaseSync(path);
		raw.exec("CREATE TABLE rows_of_another_store (k TEXT PRIMARY KEY)");
		raw.close();
		assert.throws(
			() => openDatabase(path, "en"),
			(error: unknown) =>
				error instanceof MemlensError && error.code === "Data",
		);
		const reopened = new DatabaseSync(path);
		assert.deepEqual(tables(reopened), ["rows_of_another_store"]);
		reopened.close();
	});
});
// #endregion FUNC_test_migration
