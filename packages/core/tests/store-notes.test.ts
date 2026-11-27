/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove that each note write keeps the row, the index, the nodes, the journal, and the clock in step.
 * @scope The duplicate check, the slot order, the single and the bulk scope move, the index removal, the restore, the redaction, and the review fields.
 * @keywords test, note, amend, move, hide, restore, redact, review, fts, slot
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterAll, describe, it, vi } from "vitest";
import { nowIso } from "../src/domain/time.js";
import { ulid } from "../src/domain/ulid.js";
import {
	amend,
	hide,
	move,
	note,
	redact,
	restore,
	review,
} from "../src/store/notes.js";
import { check } from "../src/store/repair.js";
import { search } from "../src/store/search.js";
import { Store } from "../src/store/store.js";
import type { Note, WriteResult } from "../src/store/types.js";
import type { ScopeKey } from "../src/types/primitives.js";

const stores: Store[] = [];

const dirs: string[] = [];

afterAll(() => {
	for (const store of stores) store.close();
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

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

function idOf(result: WriteResult<Note>): string {
	if (!result.ok) assert.fail(result.reason);
	return result.value.id;
}

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

function ftsCount(store: Store, term: string): number {
	return count(store, "SELECT count(*) AS c FROM fts WHERE fts MATCH ?", term);
}

function order(store: Store, scope: ScopeKey): readonly string[] {
	return store
		.handle()
		.prepare("SELECT id FROM notes WHERE scope = ? ORDER BY pos")
		.all(scope)
		.map((row) => String(row.id));
}

function row(store: Store, id: string): Record<string, unknown> {
	const value = store
		.handle()
		.prepare("SELECT * FROM notes WHERE id = ?")
		.get(id);
	return value ?? {};
}

function addNode(
	db: DatabaseSync,
	summary: string,
	scope = "p:test",
	start = 0,
): void {
	db.prepare(
		"INSERT INTO nodes (scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key) VALUES (?, 1, ?, ?, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'v1', NULL, NULL)",
	).run(scope, start, summary);
}

function stable(item: Record<string, unknown>): Record<string, unknown> {
	const copy = { ...item };
	for (const key of ["scope", "pos", "modified_at", "v", "v_content"])
		delete copy[key];
	return copy;
}

function slots(store: Store, scope: ScopeKey): readonly number[] {
	return store
		.handle()
		.prepare("SELECT pos FROM notes WHERE scope = ? ORDER BY pos")
		.all(scope)
		.map((item) => Number(item.pos));
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

// #region FUNC_test_restore
/**
 * @purpose Prove that a restore returns a hidden note to the view and refuses each other state.
 */
describe("restore", () => {
	it("returns a hidden note with its slot, content, index, and one journal entry", () => {
		const { store } = fresh();
		const created = note(store, {
			...BASE,
			body: "restorecanaryzzq",
			review_at: "2026-12-01",
			ts: "2026-01-01T00:00:00.000Z",
		});
		const id = idOf(created);
		note(store, {
			...BASE,
			body: "A later fact.",
			ts: "2026-02-01T00:00:00.000Z",
		});
		hide(store, id, "No longer true.");
		addNode(store.handle(), "A stale summary of the first slot.");
		assert.equal(ftsCount(store, "restorecanaryzzq"), 0);
		const before = row(store, id);
		vi.setSystemTime(new Date("2026-01-03T00:00:00.000Z"));
		const restored = restore(store, id, "Operator request.");
		vi.useRealTimers();
		assert.equal(restored.state, "live");
		assert.equal(restored.pos, 0);
		assert.equal(restored.body, "restorecanaryzzq");
		assert.equal(restored.review_at, "2026-12-01");
		assert.equal(restored.reviewed_at, null);
		assert.notEqual(restored.v, before.v);
		assert.equal(restored.modified_at, "2026-01-03T00:00:00.000Z");
		assert.equal(ftsCount(store, "restorecanaryzzq"), 1);
		assert.equal(count(store, "SELECT count(*) AS c FROM fts_docsize"), 2);
		assert.equal(count(store, "SELECT count(*) AS c FROM nodes"), 0);
		assert.deepEqual(slots(store, BASE.scope), [0, 1]);
		const entry = store
			.handle()
			.prepare(
				"SELECT op, target, scope, reason FROM journal ORDER BY seq DESC LIMIT 1",
			)
			.get();
		assert.deepEqual(
			{ ...entry },
			{
				op: "restore",
				target: id,
				scope: BASE.scope,
				reason: "Operator request.",
			},
		);
		assert.deepEqual(check(store), []);
	});

	it("keeps the supersede link and the content of the restored note", () => {
		const { store } = fresh();
		const older = note(store, { ...BASE, body: "restorecanaryzzq" });
		const next = note(store, {
			...BASE,
			body: "The replacing fact.",
			supersedes: [idOf(older)],
		});
		const restored = restore(store, idOf(older), "Operator request.");
		assert.equal(restored.state, "live");
		assert.equal(restored.superseded_by, idOf(next));
		assert.equal(restored.body, "restorecanaryzzq");
		assert.equal(ftsCount(store, "restorecanaryzzq"), 1);
	});

	it("refuses each target that is not hidden and moves no clock", () => {
		const { store } = fresh();
		const live = idOf(note(store, { ...BASE, body: "A live fact." }));
		const deleted = idOf(note(store, { ...BASE, body: "A deleted fact." }));
		hide(store, deleted, "No longer true.");
		store
			.handle()
			.prepare("UPDATE notes SET state = 'deleted' WHERE id = ?")
			.run(deleted);
		const cleared = idOf(note(store, { ...BASE, body: "A cleared fact." }));
		redact(store, cleared, "Operator request.");
		const rev = store.rev();
		for (const id of [live, deleted, cleared, "01J0Z0000000000000000000Z"])
			assert.throws(() => restore(store, id, "Operator request."), isData);
		assert.equal(store.rev(), rev);
		assert.equal(
			count(store, "SELECT count(*) AS c FROM notes WHERE state = 'live'"),
			1,
		);
		assert.equal(
			count(store, "SELECT count(*) AS c FROM journal WHERE op = 'restore'"),
			0,
		);
	});

	it("rolls back a failed restore and keeps the clock", () => {
		const { store } = fresh();
		const created = note(store, { ...BASE, body: "restorecanaryzzq" });
		const id = idOf(created);
		hide(store, id, "No longer true.");
		addNode(store.handle(), "A summary of the first slot.");
		const rev = store.rev();
		store
			.handle()
			.exec(
				`CREATE TRIGGER restore_stop BEFORE UPDATE OF state ON notes WHEN NEW.id = '${id}' BEGIN SELECT RAISE(ABORT, 'restore stop'); END`,
			);
		assert.throws(
			() => restore(store, id, "Operator request."),
			/restore stop/,
		);
		assert.equal(row(store, id).state, "hidden");
		assert.equal(ftsCount(store, "restorecanaryzzq"), 0);
		assert.equal(count(store, "SELECT count(*) AS c FROM nodes"), 1);
		assert.equal(
			count(store, "SELECT count(*) AS c FROM journal WHERE op = 'restore'"),
			0,
		);
		assert.equal(store.rev(), rev);
	});
});

/** Tell a Data refusal from another error. */
function isData(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "Data";
}
// #endregion FUNC_test_restore

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

	it("truncates the write-ahead log after the redaction", () => {
		const { store, dir } = fresh();
		const marker = "redactwalcanaryzz77";
		const created = note(store, { ...BASE, body: `A fact with ${marker}.` });
		const cleared = redact(store, idOf(created), "Operator request.");
		assert.equal(cleared.cleared, true);
		const wal = join(dir, "memlens.db-wal");
		assert.equal(statSync(wal).size, 0);
		assert.equal(readFileSync(wal).includes(marker), false);
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

// #region FUNC_test_move
/**
 * @purpose Prove that one bulk move keeps the key order, the fields, the index, the nodes, and the clock.
 * @invariants A failed row rolls back each moved row of the same call.
 */
describe("move", () => {
	const src = "p:src" as ScopeKey;
	const dst = "p:dst" as ScopeKey;

	it("places each moved note at its key rank, with the id as the tie break", () => {
		const { store } = fresh();
		const january = note(store, {
			...BASE,
			scope: src,
			body: "A fact of January.",
			ts: "2026-01-01T00:00:00.000Z",
		});
		const local = note(store, {
			...BASE,
			scope: dst,
			body: "A fact of the destination.",
			ts: "2026-01-15T00:00:00.000Z",
		});
		const tieB = note(store, {
			...BASE,
			scope: src,
			body: "The first fact of one moment.",
			id: "01J0Z0000000000000000000B",
			ts: "2026-02-01T00:00:00.000Z",
		});
		const tieC = note(store, {
			...BASE,
			scope: src,
			body: "The second fact of one moment.",
			id: "01J0Z0000000000000000000C",
			ts: "2026-02-01T00:00:00.000Z",
		});
		const result = move(store, src, dst);
		assert.equal(result.moved, 3);
		assert.deepEqual(result.skipped, []);
		assert.deepEqual(order(store, dst), [
			idOf(january),
			idOf(local),
			idOf(tieB),
			idOf(tieC),
		]);
		assert.deepEqual(slots(store, dst), [0, 1, 2, 3]);
		assert.equal(
			count(store, "SELECT count(*) AS c FROM notes WHERE scope = ?", src),
			0,
		);
	});

	it("keeps the state and the fields outside the move", () => {
		const { store } = fresh();
		const live = note(store, {
			...BASE,
			scope: src,
			body: "A live fact.",
			ts: "2026-03-01T00:00:00.000Z",
			review_at: "2026-12-01",
			refs: ["p:src#0"],
		});
		const hidden = note(store, {
			...BASE,
			scope: src,
			body: "A hidden fact.",
			ts: "2026-04-01T00:00:00.000Z",
		});
		const deleted = note(store, {
			...BASE,
			scope: src,
			body: "A deleted fact with its content.",
			ts: "2026-05-01T00:00:00.000Z",
		});
		hide(store, idOf(hidden), "No longer true.");
		// The schema allows a deleted row that still holds its content.
		store
			.handle()
			.prepare("UPDATE notes SET state = 'deleted' WHERE id = ?")
			.run(idOf(deleted));
		const before = row(store, idOf(live));
		const result = move(store, src, dst);
		assert.equal(result.moved, 3);
		assert.equal(row(store, idOf(live)).scope, dst);
		assert.deepEqual(stable(row(store, idOf(live))), stable(before));
		assert.equal(row(store, idOf(hidden)).state, "hidden");
		const clearedState = row(store, idOf(deleted));
		assert.equal(clearedState.state, "deleted");
		assert.equal(clearedState.cleared, 0);
		assert.equal(clearedState.body, "A deleted fact with its content.");
		const versions = [idOf(live), idOf(hidden), idOf(deleted)].map((id) =>
			field(row(store, id), "v"),
		);
		assert.equal(new Set(versions).size, 1);
		assert.notEqual(versions[0], field(before, "v"));
		assert.equal(field(row(store, idOf(live)), "v_content"), versions[0]);
	});

	it("finds each moved note in the new scope only, with a clean store", () => {
		const { store } = fresh();
		const created = note(store, {
			...BASE,
			scope: src,
			body: "A movecanary fact.",
		});
		assert.equal(
			search(store, { query: "movecanary", scopes: [src] }, nowIso()).length,
			1,
		);
		move(store, src, dst);
		assert.deepEqual(
			search(store, { query: "movecanary", scopes: [src] }, nowIso()),
			[],
		);
		const found = search(
			store,
			{ query: "movecanary", scopes: [dst] },
			nowIso(),
		);
		assert.deepEqual(
			found.map((hit) => hit.id),
			[idOf(created)],
		);
		assert.equal(found[0]?.scope, dst);
		assert.deepEqual(
			search(store, { query: "movecanary" }, nowIso()).map((hit) => hit.id),
			[idOf(created)],
		);
		assert.deepEqual(check(store), []);
	});

	it("drops the covered nodes of both scopes and writes one move entry per row", () => {
		const { store } = fresh();
		const db = store.handle();
		const first = note(store, {
			...BASE,
			scope: src,
			body: "The first fact.",
			ts: "2026-01-01T00:00:00.000Z",
		});
		const second = note(store, {
			...BASE,
			scope: src,
			body: "The second fact.",
			ts: "2026-02-01T00:00:00.000Z",
		});
		const third = note(store, {
			...BASE,
			scope: src,
			body: "The third fact.",
			ts: "2026-03-01T00:00:00.000Z",
		});
		note(store, {
			...BASE,
			scope: dst,
			body: "A settled fact of the destination.",
			ts: "2026-09-01T00:00:00.000Z",
		});
		addNode(db, "A summary of the source head.", src, 0);
		addNode(db, "A summary of the source tail.", src, 2);
		addNode(db, "A summary of the destination.", dst, 0);
		assert.equal(count(store, "SELECT count(*) AS c FROM nodes"), 3);
		assert.equal(move(store, src, dst).moved, 3);
		assert.equal(count(store, "SELECT count(*) AS c FROM nodes"), 0);
		const entries = store
			.handle()
			.prepare(
				"SELECT target, scope FROM journal WHERE op = 'move' ORDER BY seq",
			)
			.all();
		assert.deepEqual(
			entries.map((entry) => [String(entry.target), String(entry.scope)]),
			[
				[idOf(first), dst],
				[idOf(second), dst],
				[idOf(third), dst],
			],
		);
		assert.equal(
			count(store, "SELECT count(*) AS c FROM journal WHERE op = 'amend'"),
			0,
		);
	});

	it("drops a covering node when the destination has no notes", () => {
		const { store } = fresh();
		note(store, { ...BASE, scope: src, body: "A fact to move." });
		addNode(store.handle(), "A stale summary of the destination.", dst);
		assert.equal(move(store, src, dst).moved, 1);
		assert.equal(count(store, "SELECT count(*) AS c FROM nodes"), 0);
		assert.deepEqual(check(store), []);
	});

	it("keeps each cleared note at its address and reports its position", () => {
		const { store } = fresh();
		const head = note(store, {
			...BASE,
			scope: src,
			body: "A fact of January.",
			ts: "2026-01-01T00:00:00.000Z",
		});
		const cleared = note(store, {
			...BASE,
			scope: src,
			body: "A fact to clear.",
			ts: "2026-02-01T00:00:00.000Z",
		});
		const tail = note(store, {
			...BASE,
			scope: src,
			body: "A fact of March.",
			ts: "2026-03-01T00:00:00.000Z",
		});
		redact(store, idOf(cleared), "Operator request.");
		const result = move(store, src, dst);
		assert.equal(result.moved, 2);
		assert.deepEqual(result.skipped, [1]);
		assert.deepEqual(order(store, dst), [idOf(head), idOf(tail)]);
		assert.deepEqual(order(store, src), [idOf(cleared)]);
		const kept = row(store, idOf(cleared));
		assert.equal(kept.scope, src);
		assert.equal(kept.pos, 1);
		assert.equal(kept.cleared, 1);
		assert.equal(kept.body, "");
	});

	it("counts the candidates of a dry run and writes no row", () => {
		const { store } = fresh();
		const head = note(store, {
			...BASE,
			scope: src,
			body: "A fact to move.",
			ts: "2026-01-01T00:00:00.000Z",
		});
		const cleared = note(store, {
			...BASE,
			scope: src,
			body: "A fact to clear.",
			ts: "2026-02-01T00:00:00.000Z",
		});
		const tail = note(store, {
			...BASE,
			scope: src,
			body: "A fact to move too.",
			ts: "2026-03-01T00:00:00.000Z",
		});
		redact(store, idOf(cleared), "Operator request.");
		const rev = store.rev();
		const result = move(store, src, dst, { dryRun: true });
		assert.equal(result.moved, 2);
		assert.deepEqual(result.skipped, [1]);
		assert.equal(store.rev(), rev);
		assert.deepEqual(order(store, src), [
			idOf(head),
			idOf(cleared),
			idOf(tail),
		]);
		assert.equal(
			count(store, "SELECT count(*) AS c FROM notes WHERE scope = ?", dst),
			0,
		);
		assert.equal(
			count(store, "SELECT count(*) AS c FROM journal WHERE op = 'move'"),
			0,
		);
	});

	it("writes nothing for the same scope, an empty source, or a second move", () => {
		const { store } = fresh();
		note(store, { ...BASE, scope: src, body: "A fact that stays for now." });
		const rev = store.rev();
		assert.deepEqual(move(store, src, src), { moved: 0, skipped: [] });
		assert.deepEqual(move(store, "p:empty" as ScopeKey, dst), {
			moved: 0,
			skipped: [],
		});
		assert.equal(store.rev(), rev);
		assert.deepEqual(move(store, src, dst), { moved: 1, skipped: [] });
		const after = store.rev();
		assert.deepEqual(move(store, src, dst), { moved: 0, skipped: [] });
		assert.equal(store.rev(), after);
	});

	it("rolls back each moved row when one row fails", () => {
		const { store } = fresh();
		const first = note(store, {
			...BASE,
			scope: src,
			body: "The first fact.",
			ts: "2026-01-01T00:00:00.000Z",
		});
		const second = note(store, {
			...BASE,
			scope: src,
			body: "The second fact.",
			ts: "2026-02-01T00:00:00.000Z",
		});
		const rev = store.rev();
		store
			.handle()
			.exec(
				`CREATE TRIGGER move_stop BEFORE UPDATE OF scope ON notes WHEN NEW.id = '${idOf(second)}' BEGIN SELECT RAISE(ABORT, 'move stop'); END`,
			);
		assert.throws(() => move(store, src, dst), /move stop/);
		assert.deepEqual(order(store, src), [idOf(first), idOf(second)]);
		assert.deepEqual(slots(store, src), [0, 1]);
		assert.equal(
			count(store, "SELECT count(*) AS c FROM notes WHERE scope = ?", dst),
			0,
		);
		assert.equal(
			count(store, "SELECT count(*) AS c FROM journal WHERE op = 'move'"),
			0,
		);
		assert.equal(store.rev(), rev);
	});

	it("keeps the key order when the destination holds a gap", () => {
		const { store } = fresh();
		const december = note(store, {
			...BASE,
			scope: dst,
			body: "A fact of December.",
			ts: "2025-12-01T00:00:00.000Z",
		});
		const january = note(store, {
			...BASE,
			scope: dst,
			body: "A fact of January.",
			ts: "2026-01-01T00:00:00.000Z",
		});
		amend(store, { id: idOf(december), scope: "p:else" as ScopeKey });
		assert.deepEqual(slots(store, dst), [1]);
		const february = note(store, {
			...BASE,
			scope: src,
			body: "A fact of February.",
			ts: "2026-02-01T00:00:00.000Z",
		});
		assert.equal(move(store, src, dst).moved, 1);
		assert.deepEqual(order(store, dst), [idOf(january), idOf(february)]);
		assert.deepEqual(slots(store, dst), [1, 2]);
	});
});
// #endregion FUNC_test_move

function field(item: Record<string, unknown>, key: string): string {
	return String(item[key]);
}
