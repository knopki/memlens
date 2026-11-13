/**
 * Tests of the store clock and the schema.
 *
 * #region moduleContract
 * @purpose Prove the clock order and the schema invariants under the real SQLite engine.
 * @scope The clock rules, the open, the meta rows, the index flavor, and the redaction bytes.
 * @keywords test, clock, schema, redaction, bytes
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, it } from "vitest";
import {
	formatVersion,
	parseVersion,
	receive,
	tick,
} from "../src/store/clock.js";
import { openDatabase, SCHEMA_VERSION } from "../src/store/schema.js";

const dirs: string[] = [mkdtempSync(join(tmpdir(), "memlens-"))];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

// #region FUNC_test_clock
/**
 * @purpose Prove that a local write after a receive outranks every received version.
 * @invariants A backward clock jump changes no order. Equal physical time still gives a greater version.
 */
describe("clock", () => {
	it("orders a local write above a received version with a later wall clock", () => {
		const store = { physical: 0, counter: 0, store: "aaa" };
		const first = tick(store, 1_000);
		const remote = formatVersion({
			physical: 9_999_999_999_999,
			counter: 0,
			store: "zzz",
		});
		const afterReceive = receive(first.state, [remote]);
		const local = tick(afterReceive, 1_500);
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
 * @purpose Prove the schema of a new store, the index flavor, and the redaction bytes.
 * @invariants A pooled connection that misses secure_delete leaves the marker in the file.
 */
describe("schema", () => {
	it("creates each table and the meta rows", () => {
		const dir = mkdtempSync(join(tmpdir(), "memlens-"));
		dirs.push(dir);
		const db = openDatabase(join(dir, "memlens.db"), "en");
		const names = db
			.prepare(
				"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
			)
			.all()
			.map((row) => String(row.name));
		for (const table of ["meta", "notes", "nodes", "proposals", "journal"]) {
			assert.ok(names.includes(table), `missing ${table}`);
		}
		assert.equal(
			db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get()
				?.value,
			String(SCHEMA_VERSION),
		);
		assert.equal(db.prepare("PRAGMA secure_delete").get()?.secure_delete, 1);
		db.close();
	});

	it("refuses an old event-store database with a message that names the action", () => {
		const dir = mkdtempSync(join(tmpdir(), "memlens-"));
		dirs.push(dir);
		const path = join(dir, "memlens.db");
		const old = openDatabase(path, "en");
		old.exec("CREATE TABLE events (id TEXT PRIMARY KEY)");
		old.close();
		assert.throws(
			() => openDatabase(path, "en"),
			/move the store directory away/i,
		);
	});

	it("removes the marker bytes from the database file and the log", () => {
		const dir = mkdtempSync(join(tmpdir(), "memlens-"));
		dirs.push(dir);
		const path = join(dir, "memlens.db");
		const db = openDatabase(path, "en");
		const marker = "canary-marker-zzq-42";
		db.prepare(
			"INSERT INTO notes (id, scope, pos, state, kind, body, ts, created_at, modified_at, v, v_content) VALUES ('01', 'p:x', 0, 'live', 'note', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'a', 'a')",
		).run(marker);
		db.prepare(
			"INSERT INTO fts (rowid, body, longform) VALUES (1, ?, NULL)",
		).run(marker);
		db.exec("BEGIN IMMEDIATE");
		db.prepare(
			"UPDATE notes SET state = 'deleted', cleared = 1, body = '', longform = NULL WHERE id = '01'",
		).run();
		db.prepare("DELETE FROM fts WHERE rowid = 1").run();
		db.exec("COMMIT");
		db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
		db.close();
		const bytes = readFileSync(path).toString("latin1");
		const log = existsSync(`${path}-wal`)
			? readFileSync(`${path}-wal`).toString("latin1")
			: "";
		const walHolds = log.includes(marker);
		assert.equal(
			bytes.includes(marker) || walHolds,
			false,
			`marker survived: db=${bytes.includes(marker)} wal=${walHolds}`,
		);
	});
});
// #endregion FUNC_test_schema
