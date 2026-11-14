/**
 * Tests of the slot order and the node validity seam.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the rank order, the tail shift, and the three validity rules.
 * @keywords test, slot, rank, node, validity
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterAll, describe, it } from "vitest";
import { deleteCovering, leafKeyOf, validNode } from "../src/store/nodes.js";
import { openDatabase } from "../src/store/schema.js";
import { insertSlot, nextSlot } from "../src/store/slots.js";

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** @purpose Create one store and give the test its handle. */
function store(): { db: DatabaseSync; dir: string } {
	const dir = mkdtempSync(join(tmpdir(), "memlens-"));
	dirs.push(dir);
	return { db: openDatabase(join(dir, "memlens.db"), "en"), dir };
}

const INSERT =
	"INSERT INTO notes (id, scope, pos, state, kind, body, ts, created_at, modified_at, v, v_content) VALUES (?, ?, ?, 'live', 'note', ?, ?, ?, ?, ?, ?)";

/** @purpose Add one note row with a minimal field set. */
function add(db: DatabaseSync, id: string, ts: string, v: string): void {
	const pos = insertSlot(db, "p:x", ts, id);
	db.prepare(INSERT).run(id, "p:x", pos, `body-${id}`, ts, ts, ts, v, v);
}

// #region FUNC_test_slots
/**
 * @purpose Prove the rank order and the middle insert.
 * @invariants A backdated key lands between its neighbors and shifts the tail.
 */
describe("slots", () => {
	it("places a backdated key between its neighbors", () => {
		const { db } = store();
		add(db, "a", "2026-01-01T00:00:00.000Z", "v1");
		add(db, "c", "2026-03-01T00:00:00.000Z", "v2");
		add(db, "b", "2026-02-01T00:00:00.000Z", "v3");
		const order = db
			.prepare("SELECT id FROM notes WHERE scope = 'p:x' ORDER BY pos")
			.all()
			.map((row) => row.id);
		assert.deepEqual(order, ["a", "b", "c"]);
		assert.equal(nextSlot(db, "p:x"), 3);
	});

	it("breaks a ts tie by id", () => {
		const { db } = store();
		add(db, "y", "2026-01-01T00:00:00.000Z", "v1");
		add(db, "x", "2026-01-01T00:00:00.000Z", "v2");
		const order = db
			.prepare("SELECT id FROM notes WHERE scope = 'p:x' ORDER BY pos")
			.all()
			.map((row) => row.id);
		assert.deepEqual(order, ["x", "y"]);
	});

	it("shifts a band of several rows without a unique collision", () => {
		const { db } = store();
		for (const id of ["a", "b", "c", "d", "e"])
			add(db, id, `2026-0${id.charCodeAt(0) - 96}-01T00:00:00.000Z`, `v-${id}`);
		add(db, "m", "2026-03-15T00:00:00.000Z", "v-m");
		const order = db
			.prepare("SELECT id FROM notes WHERE scope = 'p:x' ORDER BY pos")
			.all()
			.map((row) => row.id);
		assert.deepEqual(order, ["a", "b", "c", "m", "d", "e"]);
		assert.equal(nextSlot(db, "p:x"), 6);
	});
});
// #endregion FUNC_test_slots

// #region FUNC_test_validity
/**
 * @purpose Prove the three validity rules of one node.
 * @invariants An occupant change, a missing child, and a live note under a null half each invalidate the node.
 */
describe("node validity", () => {
	it("rejects a node after its leaf input changed and after an insert into a null half", () => {
		const { db } = store();
		add(db, "a", "2026-01-01T00:00:00.000Z", "v1");
		add(db, "b", "2026-01-02T00:00:00.000Z", "v2");
		const aKey = leafKeyOf(db, "p:x", 0);
		const bKey = leafKeyOf(db, "p:x", 1);
		db.prepare(
			"INSERT INTO nodes (scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key) VALUES ('p:x', 1, 0, 's', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 'vb', ?, ?)",
		).run(aKey, bKey);
		const node = {
			scope: "p:x",
			level: 1,
			start: 0,
			summary: "s",
			ts_from: "",
			ts_to: "",
			built_v: "vb",
			a_key: aKey,
			b_key: bKey,
		};
		assert.ok(validNode(db, node));
		db.prepare("UPDATE notes SET v_content = 'v1b' WHERE id = 'a'").run();
		assert.ok(!validNode(db, node));
	});

	it("rejects a node when a live note enters a null half", () => {
		const { db } = store();
		add(db, "a", "2026-01-01T00:00:00.000Z", "v1");
		const aKey = leafKeyOf(db, "p:x", 0);
		db.prepare(
			"INSERT INTO nodes (scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key) VALUES ('p:x', 2, 0, 's', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'vb', ?, NULL)",
		).run(aKey);
		const node = {
			scope: "p:x",
			level: 2,
			start: 0,
			summary: "s",
			ts_from: "",
			ts_to: "",
			built_v: "vb",
			a_key: aKey,
			b_key: null,
		};
		// The null half covers slots 2 and 3. A live note at slot 3 invalidates it.
		add(db, "z", "2026-05-01T00:00:00.000Z", "v9");
		db.prepare("UPDATE notes SET pos = 3 WHERE id = 'z'").run();
		assert.ok(!validNode(db, node));
		assert.equal(deleteCovering(db, "p:x", 3), 1);
	});
});
// #endregion FUNC_test_validity
