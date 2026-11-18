/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove that each note write keeps the row, the index, the nodes, the journal, and the clock in step.
 * @scope The duplicate check, the slot order, the scope move, the index removal, the redaction, and the review fields.
 * @keywords test, note, amend, hide, redact, review, fts, slot
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterAll, describe, it } from "vitest";
import { ulid } from "../src/domain/ulid.js";
import { amend, hide, note, redact, review } from "../src/store/notes.js";
import { Store } from "../src/store/store.js";
import type { Note, WriteResult } from "../src/store/types.js";
import type { ScopeKey } from "../src/types/primitives.js";

const stores: Store[] = [];

const dirs: string[] = [];

afterAll(() => {
	for (const store of stores) store.close();
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** @purpose Create one empty store, and remove it after the test run. */
function fresh(): { store: Store; dir: string } {
	const dir = mkdtempSync(join(tmpdir(), "memlens-notes-"));
	const store = new Store(dir);
	stores.push(store);
	dirs.push(dir);
	return { store, dir };
}

const BASE = {
	scope: "p:test" as ScopeKey,
	kind: "fact" as const,
	session: "session-1",
	turn: "turn-1",
	preset: "preset-1",
};

/** @purpose Give one accepted note write its id, or stop the test. */
function idOf(result: WriteResult<Note>): string {
	if (!result.ok) assert.fail(result.reason);
	return result.value.id;
}

/** @purpose Count the rows of one query under the alias `c`. */
function count(
	store: Store,
	sql: string,
	...params: readonly (string | number | null)[]
): number {
	const row = store
		.handle()
		.prepare(sql)
		.get(...params);
	return Number(row?.c ?? 0);
}

/** @purpose Count the index rows that hold one term. */
function ftsCount(store: Store, term: string): number {
	return count(store, "SELECT count(*) AS c FROM fts WHERE fts MATCH ?", term);
}

/** @purpose List the ids of one scope in slot order. */
function order(store: Store, scope: ScopeKey): readonly string[] {
	return store
		.handle()
		.prepare("SELECT id FROM notes WHERE scope = ? ORDER BY pos")
		.all(scope)
		.map((row) => String(row.id));
}

/** @purpose Read the raw fields of one note row. */
function row(store: Store, id: string): Record<string, unknown> {
	const value = store
		.handle()
		.prepare("SELECT * FROM notes WHERE id = ?")
		.get(id);
	return value ?? {};
}

/** @purpose Add one node row over slot zero of the test scope. */
function addNode(db: DatabaseSync, summary: string): void {
	db.prepare(
		"INSERT INTO nodes (scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key) VALUES ('p:test', 1, 0, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'v1', NULL, NULL)",
	).run(summary);
}

// #region FUNC_test_dedup
/**
 * @purpose Prove that a repeated note returns the duplicate reason and changes no row.
 */
describe("dedup", () => {
	it("returns duplicate with the live note and writes nothing", () => {
		const { store } = fresh();
		const first = note(store, { ...BASE, body: "A stable fact." });
		if (!first.ok) assert.fail(first.reason);
		const rev = store.rev();
		const again = note(store, { ...BASE, body: "A stable fact." });
		assert.equal(again.ok, false);
		if (!again.ok) {
			assert.equal(again.reason, "duplicate");
			assert.equal(again.value?.id, first.value.id);
		}
		assert.equal(count(store, "SELECT count(*) AS c FROM notes"), 1);
		assert.equal(store.rev(), rev);
	});

	it("writes a note with the same body and another kind", () => {
		const { store } = fresh();
		const first = note(store, { ...BASE, body: "A stable fact." });
		if (!first.ok) assert.fail(first.reason);
		const second = note(store, {
			...BASE,
			body: "A stable fact.",
			kind: "task",
		});
		assert.equal(second.ok, true);
		assert.equal(count(store, "SELECT count(*) AS c FROM notes"), 2);
	});
});
// #endregion FUNC_test_dedup

// #region FUNC_test_supersede
/**
 * @purpose Prove that a supersede list hides each target and links the new note.
 */
describe("supersede", () => {
	it("hides each target and links the new note", () => {
		const { store } = fresh();
		const older = note(store, { ...BASE, body: "supersedecanary" });
		const olderId = idOf(older);
		assert.equal(ftsCount(store, "supersedecanary"), 1);
		const next = note(store, {
			...BASE,
			body: "The new fact.",
			supersedes: [olderId],
		});
		const nextId = idOf(next);
		const target = row(store, olderId);
		assert.equal(target.state, "hidden");
		assert.equal(target.superseded_by, nextId);
		assert.equal(ftsCount(store, "supersedecanary"), 0);
		assert.equal(
			count(store, "SELECT count(*) AS c FROM notes WHERE state = 'live'"),
			1,
		);
	});

	it("refuses a target in another scope", () => {
		const { store } = fresh();
		const other = note(store, {
			...BASE,
			scope: "p:other" as ScopeKey,
			body: "A fact in another scope.",
		});
		assert.throws(
			() =>
				note(store, {
					...BASE,
					body: "A fact with a wrong target.",
					supersedes: [idOf(other)],
				}),
			(error: unknown) =>
				error instanceof Error &&
				"code" in error &&
				error.code === "CrossScopeSupersede",
		);
	});
});
// #endregion FUNC_test_supersede

// #region FUNC_test_slotOrder
/**
 * @purpose Prove that a backdated note lands between its neighbors and moves the later slots.
 */
describe("slot order", () => {
	it("places a backdated note between its neighbors", () => {
		const { store } = fresh();
		const jan = note(store, {
			...BASE,
			body: "The first fact.",
			ts: "2026-01-01T00:00:00.000Z",
		});
		const mar = note(store, {
			...BASE,
			body: "The third fact.",
			ts: "2026-03-01T00:00:00.000Z",
		});
		const apr = note(store, {
			...BASE,
			body: "The fourth fact.",
			ts: "2026-04-01T00:00:00.000Z",
		});
		const before = order(store, BASE.scope);
		assert.deepEqual(before, [idOf(jan), idOf(mar), idOf(apr)]);
		const feb = note(store, {
			...BASE,
			body: "The second fact.",
			ts: "2026-02-01T00:00:00.000Z",
		});
		const after = order(store, BASE.scope);
		assert.deepEqual(after, [idOf(jan), idOf(feb), idOf(mar), idOf(apr)]);
		const slots = store
			.handle()
			.prepare("SELECT pos FROM notes WHERE scope = ? ORDER BY pos")
			.all(BASE.scope)
			.map((item) => Number(item.pos));
		assert.deepEqual(slots, [0, 1, 2, 3]);
	});
});
// #endregion FUNC_test_slotOrder

// #region FUNC_test_amend
/**
 * @purpose Prove that a scope move puts the note at its key rank in the destination scope.
 */
describe("amend", () => {
	it("moves a note to its rank in the destination scope", () => {
		const { store } = fresh();
		const older = note(store, {
			...BASE,
			scope: "p:old" as ScopeKey,
			body: "A fact that changes scope.",
			ts: "2026-01-01T00:00:00.000Z",
		});
		const later = note(store, {
			...BASE,
			scope: "p:next" as ScopeKey,
			body: "A later fact.",
			ts: "2026-03-01T00:00:00.000Z",
		});
		const id = idOf(older);
		const changed = amend(store, {
			id,
			scope: "p:next" as ScopeKey,
			body: "A moved fact.",
		});
		assert.equal(changed.scope, "p:next");
		assert.equal(changed.pos, 0);
		assert.equal(changed.body, "A moved fact.");
		assert.deepEqual(order(store, "p:next" as ScopeKey), [id, idOf(later)]);
		assert.equal(
			count(store, "SELECT count(*) AS c FROM notes WHERE scope = ?", "p:old"),
			0,
		);
	});

	it("keeps the slot of a note when the scope stays", () => {
		const { store } = fresh();
		const created = note(store, { ...BASE, body: "The first fact." });
		const id = idOf(created);
		const changed = amend(store, { id, body: "The changed fact." });
		assert.equal(changed.pos, 0);
		assert.equal(changed.body, "The changed fact.");
	});
});
// #endregion FUNC_test_amend

// #region FUNC_test_hide
/**
 * @purpose Prove that a hide removes the index row and keeps the content row.
 */
describe("hide", () => {
	it("removes the index row", () => {
		const { store } = fresh();
		const created = note(store, { ...BASE, body: "hidecanaryzzq" });
		const id = idOf(created);
		assert.equal(ftsCount(store, "hidecanaryzzq"), 1);
		assert.equal(count(store, "SELECT count(*) AS c FROM fts_docsize"), 1);
		const hidden = hide(store, id, "No longer true.");
		assert.equal(hidden.state, "hidden");
		// The external-content table counts content rows, so a scan of fts stays one. The shadow table counts index rows.
		assert.equal(count(store, "SELECT count(*) AS c FROM fts"), 1);
		assert.equal(count(store, "SELECT count(*) AS c FROM fts_docsize"), 0);
		assert.equal(ftsCount(store, "hidecanaryzzq"), 0);
		assert.equal(row(store, id).state, "hidden");
	});
});
// #endregion FUNC_test_hide

// #region FUNC_test_redact
/**
 * @purpose Prove that a redact clears the content, the nodes, and the proposals.
 */
describe("redact", () => {
	it("clears content, nodes, and proposals", () => {
		const { store } = fresh();
		const marker = "redactcanaryzzq42";
		const created = note(store, { ...BASE, body: `A fact with ${marker}.` });
		const id = idOf(created);
		const db = store.handle();
		addNode(db, `A summary with ${marker}.`);
		db.prepare(
			"INSERT INTO proposals (id, scope, op, target, payload, created_at, expires_at) VALUES (?, 'p:test', 'amend', ?, ?, ?, ?)",
		).run(
			ulid(Date.now()),
			id,
			`{"body":"${marker}"}`,
			"2026-01-01T00:00:00.000Z",
			"2026-02-01T00:00:00.000Z",
		);
		assert.equal(count(store, "SELECT count(*) AS c FROM nodes"), 1);
		assert.equal(count(store, "SELECT count(*) AS c FROM proposals"), 1);
		const cleared = redact(store, id, "Operator request.");
		assert.equal(cleared.state, "deleted");
		assert.equal(cleared.cleared, true);
		assert.equal(cleared.body, "");
		assert.equal(cleared.longform, null);
		assert.equal(count(store, "SELECT count(*) AS c FROM nodes"), 0);
		assert.equal(count(store, "SELECT count(*) AS c FROM proposals"), 0);
		assert.equal(ftsCount(store, marker), 0);
	});
});
// #endregion FUNC_test_redact

// #region FUNC_test_review
/**
 * @purpose Prove that a review changes the review fields and leaves the content and the nodes.
 */
describe("review", () => {
	it("keeps modified_at and the node rows", () => {
		const { store } = fresh();
		const created = note(store, { ...BASE, body: "reviewcanary" });
		const id = idOf(created);
		addNode(store.handle(), "A summary.");
		const before = row(store, id);
		const reviewed = review(store, id, "2026-12-01");
		assert.equal(reviewed.review_at, "2026-12-01");
		assert.notEqual(reviewed.reviewed_at, null);
		assert.equal(reviewed.v_review, reviewed.v);
		assert.equal(reviewed.modified_at, before.modified_at);
		assert.equal(field(row(store, id), "modified_at"), before.modified_at);
		assert.equal(count(store, "SELECT count(*) AS c FROM nodes"), 1);
		assert.equal(ftsCount(store, "reviewcanary"), 1);
	});
});
// #endregion FUNC_test_review

/** @purpose Read one field of a raw row as a string. */
function field(item: Record<string, unknown>, key: string): string {
	return String(item[key]);
}
