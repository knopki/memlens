/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the proposal lifecycle and the repair checks under the real SQLite engine.
 * @scope The open row, the expiry, the sweep, the accept rollback, the dismiss, and each repair action.
 * @scope NOT: the note write path or the node build.
 * @invariants Each transaction check proves both or neither of the two writes.
 * @keywords test, proposal, accept, dismiss, expire, repair, node, fts, journal
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterAll, describe, it } from "vitest";
import { noteTx } from "../src/store/notes.js";
import {
	accept,
	dismiss,
	pending,
	propose,
	sweep,
} from "../src/store/proposals.js";
import { check } from "../src/store/repair.js";
import { Store } from "../src/store/store.js";
import { MemlensError } from "../src/types/errors.js";

const dirs: string[] = [];

const stores: Store[] = [];

afterAll(() => {
	for (const store of stores) store.close();
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function open(): Store {
	const dir = mkdtempSync(join(tmpdir(), "memlens-"));
	dirs.push(dir);
	const store = new Store(dir);
	stores.push(store);
	return store;
}

function addNote(store: Store, id: string, body: string, state = "live"): void {
	const db = store.handle();
	const next = db
		.prepare(
			"SELECT COALESCE(MAX(pos) + 1, 0) AS next FROM notes WHERE scope = 'p:x'",
		)
		.get();
	const pos = Number(next?.next ?? 0);
	const at = "2026-01-01T00:00:00.000Z";
	db.prepare(
		"INSERT INTO notes (id, scope, pos, state, kind, body, ts, created_at, modified_at, v, v_content) VALUES (?, 'p:x', ?, ?, 'note', ?, ?, ?, ?, 'v1', 'v1')",
	).run(id, pos, state, body, at, at, at);
	const row = db.prepare("SELECT n FROM notes WHERE id = ?").get(id);
	if (state === "live")
		db.prepare(
			"INSERT INTO fts(rowid, body, longform) VALUES (?, ?, NULL)",
		).run(row?.n, body);
}

function addJournal(store: Store, count: number): void {
	const stmt = store
		.handle()
		.prepare(
			"INSERT INTO journal (at, store, op, target, scope, reason) VALUES (?, 'test', 'note', NULL, 'p:x', NULL)",
		);
	for (let index = 0; index < count; index += 1)
		stmt.run(new Date().toISOString());
}

function proposalRow(store: Store, id: string) {
	return store
		.handle()
		.prepare("SELECT closed, payload FROM proposals WHERE id = ?")
		.get(id);
}

function rows(store: Store, table: "notes" | "nodes" | "journal"): number {
	return Number(
		store.handle().prepare(`SELECT count(*) AS c FROM ${table}`).get()?.c ?? 0,
	);
}

function indexedRows(store: Store): number {
	return Number(
		store.handle().prepare("SELECT count(*) AS c FROM fts_docsize").get()?.c ??
			0,
	);
}

// #region FUNC_test_proposals
/**
 * @purpose Prove the open row, the pending order, the expiry sweep, the decision, and the rollback.
 * @invariants A closed row keeps no payload and a refused id changes no row.
 */
describe("proposals", () => {
	it("stores an open row with a thirty-day expiry and lists it as pending", () => {
		const store = open();
		const proposal = propose(store, {
			id: "01PROPOSALONE",
			scope: "p:x",
			op: "note",
			payload: { body: "alpha" },
		});
		assert.equal(proposal.status, "open");
		const row = proposalRow(store, "01PROPOSALONE");
		assert.equal(row?.closed, 0);
		assert.equal(row?.payload, JSON.stringify({ body: "alpha" }));
		const span =
			Date.parse(proposal.expires_at) - Date.parse(proposal.created_at);
		assert.equal(span, 30 * 86_400_000);
		const list = pending(store);
		assert.equal(list.length, 1);
		assert.equal(list[0]?.id, "01PROPOSALONE");
		assert.equal(list[0]?.status, "open");
	});

	it("orders pending rows by creation time", () => {
		const store = open();
		const stmt = store
			.handle()
			.prepare(
				"INSERT INTO proposals (id, scope, op, target, payload, created_at, expires_at, closed) VALUES (?, 'p:x', 'note', NULL, '{}', ?, '2026-06-01T00:00:00.000Z', 0)",
			);
		stmt.run("01NEWER", "2026-02-01T00:00:00.000Z");
		stmt.run("01OLDER", "2026-01-01T00:00:00.000Z");
		assert.deepEqual(
			pending(store).map((item) => item.id),
			["01OLDER", "01NEWER"],
		);
	});

	it("closes only the expired rows and clears their payload", () => {
		const store = open();
		propose(store, { id: "01EXPIRED", scope: "p:x", op: "note", payload: {} });
		propose(store, { id: "01OPEN", scope: "p:x", op: "note", payload: {} });
		store
			.handle()
			.prepare(
				"UPDATE proposals SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = '01EXPIRED'",
			)
			.run();
		assert.equal(sweep(store), 1);
		const closed = proposalRow(store, "01EXPIRED");
		assert.equal(closed?.closed, 3);
		assert.equal(closed?.payload, "");
		const kept = proposalRow(store, "01OPEN");
		assert.equal(kept?.closed, 0);
		assert.notEqual(kept?.payload, "");
		assert.equal(sweep(store), 0);
		assert.deepEqual(
			pending(store).map((item) => item.id),
			["01OPEN"],
		);
	});

	it("takes no write lock when no row expires", () => {
		const dir = mkdtempSync(join(tmpdir(), "memlens-"));
		dirs.push(dir);
		const store = new Store(dir);
		stores.push(store);
		propose(store, { id: "01FUTURE", scope: "p:x", op: "note", payload: {} });
		const other = new DatabaseSync(join(dir, "memlens.db"));
		other.exec("BEGIN IMMEDIATE");
		try {
			const started = Date.now();
			assert.equal(sweep(store), 0);
			assert.ok(
				Date.now() - started < 900,
				"the sweep waited on the write lock of another connection",
			);
			assert.equal(proposalRow(store, "01FUTURE")?.closed, 0);
		} finally {
			other.exec("ROLLBACK");
			other.close();
		}
	});

	it("applies the payload and closes the row in one transaction", () => {
		const store = open();
		propose(store, {
			id: "01ACCEPT",
			scope: "p:x",
			op: "note",
			payload: { body: "accepted" },
		});
		accept(
			store,
			"01ACCEPT",
			(payload, tx) => {
				noteTx(tx, {
					id: "01ACCEPTNOTE",
					scope: "p:x",
					kind: "note",
					body: (payload as { body: string }).body,
					session: "s",
					turn: "t",
					preset: "p",
				});
			},
			["p:x"],
		);
		const row = proposalRow(store, "01ACCEPT");
		assert.equal(row?.closed, 1);
		assert.equal(row?.payload, "");
		const note = store
			.handle()
			.prepare("SELECT body FROM notes WHERE id = '01ACCEPTNOTE'")
			.get();
		assert.equal(note?.body, "accepted");
	});

	it("keeps the row open and writes nothing when the apply call throws", () => {
		const store = open();
		propose(store, {
			id: "01ROLLBACK",
			scope: "p:x",
			op: "note",
			payload: { body: "rolled back" },
		});
		assert.throws(
			() =>
				accept(
					store,
					"01ROLLBACK",
					(payload, tx) => {
						const body = (payload as { body: string }).body;
						tx.db
							.prepare(
								"INSERT INTO notes (id, scope, pos, state, kind, body, ts, created_at, modified_at, v, v_content) VALUES ('01ROLLEDNOTE', 'p:x', 0, 'live', 'note', ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'v1', 'v1')",
							)
							.run(body);
						throw new Error("apply failed");
					},
					["p:x"],
				),
			/apply failed/,
		);
		const row = proposalRow(store, "01ROLLBACK");
		assert.equal(row?.closed, 0);
		assert.equal(row?.payload, JSON.stringify({ body: "rolled back" }));
		assert.equal(rows(store, "notes"), 0);
	});

	it("refuses an expired row and an invisible scope without a write", () => {
		const store = open();
		propose(store, { id: "01LATE", scope: "p:x", op: "note", payload: {} });
		store
			.handle()
			.prepare(
				"UPDATE proposals SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = '01LATE'",
			)
			.run();
		assert.throws(
			() => accept(store, "01LATE", () => {}, ["p:x"]),
			(error) =>
				error instanceof MemlensError &&
				error.code === "NotAllowed" &&
				error.message === "The proposal is no longer pending or has changed.",
		);
		propose(store, { id: "01HIDDEN", scope: "q:y", op: "note", payload: {} });
		assert.throws(
			() => accept(store, "01HIDDEN", () => {}, ["p:x"]),
			(error) => error instanceof MemlensError && error.code === "NotAllowed",
		);
		assert.equal(proposalRow(store, "01LATE")?.closed, 0);
		assert.equal(proposalRow(store, "01HIDDEN")?.closed, 0);
	});

	it("dismisses an open row and refuses a closed id", () => {
		const store = open();
		propose(store, {
			id: "01DISMISS",
			scope: "p:x",
			op: "note",
			payload: { a: 1 },
		});
		dismiss(store, "01DISMISS", "too risky");
		const row = proposalRow(store, "01DISMISS");
		assert.equal(row?.closed, 2);
		assert.equal(row?.payload, "");
		const reason = store
			.handle()
			.prepare("SELECT reason FROM journal WHERE op = 'dismiss' AND target = ?")
			.get("01DISMISS");
		assert.equal(reason?.reason, "too risky");
		assert.throws(
			() => dismiss(store, "01DISMISS", "again"),
			(error) => error instanceof MemlensError && error.code === "NotAllowed",
		);
		assert.equal(proposalRow(store, "01DISMISS")?.closed, 2);
	});
});
// #endregion FUNC_test_proposals

// #region FUNC_test_repair
/**
 * @purpose Prove each repair action and the clean result.
 * @invariants An invalid node, an empty node, an index drift, and an old journal row each go.
 */
describe("repair", () => {
	it("returns no action for a clean store", () => {
		const store = open();
		assert.deepEqual(check(store), []);
	});

	it("deletes the invalid node rows and rebuilds a drifted index", () => {
		const store = open();
		addNote(store, "01NOTEALPHA", "alpha word");
		addNote(store, "01NOTEBETA", "beta word");
		const db = store.handle();
		// A stray index row: the index holds three rows for two live notes.
		db.prepare(
			"INSERT INTO fts(rowid, body, longform) VALUES (999, 'ghostterm', NULL)",
		).run();
		// A node over the two live slots with a stale left key.
		db.prepare(
			"INSERT INTO nodes (scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key) VALUES ('p:x', 1, 0, 'stale summary', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'build1', 'stale|live', NULL)",
		).run();
		const actions = check(store);
		assert.ok(
			actions.includes("delete 1 invalid node rows"),
			actions.join("; "),
		);
		assert.ok(
			actions.some((action) => action.startsWith("repair fts index")),
			actions.join("; "),
		);
		assert.equal(rows(store, "nodes"), 0);
		assert.equal(indexedRows(store), 2);
		assert.equal(
			db.prepare("SELECT count(*) AS c FROM fts WHERE fts MATCH 'alpha'").get()
				?.c,
			1,
		);
		assert.equal(
			db
				.prepare("SELECT count(*) AS c FROM fts WHERE fts MATCH 'ghostterm'")
				.get()?.c,
			0,
		);
	});

	it("keeps a valid node row over a live note", () => {
		const store = open();
		addNote(store, "01NOTEKEPT", "kept word");
		store
			.handle()
			.prepare(
				"INSERT INTO nodes (scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key) VALUES ('p:x', 1, 0, 'kept summary', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'build1', 'v1|live', NULL)",
			)
			.run();
		assert.deepEqual(check(store), []);
		assert.equal(rows(store, "nodes"), 1);
	});

	it("deletes a node whose whole range holds no live note", () => {
		const store = open();
		addNote(store, "01NOTEHIDDEN", "old text", "hidden");
		store
			.handle()
			.prepare(
				"INSERT INTO nodes (scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key) VALUES ('p:x', 1, 0, 'old summary', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'build1', 'v1|hidden', NULL)",
			)
			.run();
		assert.deepEqual(check(store), ["delete 1 empty node rows"]);
		assert.equal(rows(store, "nodes"), 0);
	});

	it("reports the planned action and changes no row in a dry run", () => {
		const store = open();
		addNote(store, "01NOTEDRYRUN", "dry text", "hidden");
		store
			.handle()
			.prepare(
				"INSERT INTO nodes (scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key) VALUES ('p:x', 1, 0, 'old summary', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'build1', 'v1|hidden', NULL)",
			)
			.run();
		assert.deepEqual(check(store, { dryRun: true }), [
			"delete 1 empty node rows",
		]);
		assert.equal(rows(store, "nodes"), 1);
		assert.deepEqual(check(store), ["delete 1 empty node rows"]);
		assert.equal(rows(store, "nodes"), 0);
	});

	it("prunes the journal to the row limit", () => {
		const store = open();
		addJournal(store, 5);
		assert.deepEqual(check(store, { journalMax: 2 }), ["prune 3 journal rows"]);
		assert.equal(rows(store, "journal"), 2);
	});
});
// #endregion FUNC_test_repair
