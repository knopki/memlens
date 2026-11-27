/**
 * #region moduleContract
 * @modulecontract
 * @purpose Verify the read answers of open, review, and the scope list.
 * @scope The store reads over rows written by raw SQL.
 * @invariants The file pins the zone to Europe/Moscow before the import.
 * @keywords test, read, open, review, scope, store
 * #endregion moduleContract
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { dayOf } from "../src/domain/day.js";
import {
	dueRecords,
	LONGFORM_ALL,
	LONGFORM_HEAD,
	openNote,
	openRange,
	scopeLines,
	upcomingRecords,
} from "../src/domain/reads.js";
import { byAddress } from "../src/store/reads.js";
import { Store } from "../src/store/store.js";
import { loadView } from "../src/store/view.js";
import type { ScopeKey } from "../src/types/primitives.js";

vi.hoisted(() => {
	process.env.TZ = "Europe/Moscow";
});

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function newStore(): Store {
	const dir = mkdtempSync(join(tmpdir(), "memlens-reads-"));
	dirs.push(dir);
	return new Store(dir);
}

/** One note row of a test fixture. */
interface Row {
	readonly scope: string;
	readonly pos: number;
	readonly body: string;
	readonly kind?: string;
	readonly state?: "live" | "hidden" | "deleted";
	readonly ts?: string;
	readonly review_at?: string | null;
	readonly longform?: string | null;
}

const INSERT_NOTE = `INSERT INTO notes
	(id, scope, pos, state, kind, body, longform, refs, ts, created_at, modified_at, review_at, v, v_content)
	VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?)`;

function addNote(store: Store, row: Row): void {
	const ts = row.ts ?? "2026-11-01T00:00:00.000Z";
	const version = `v-${row.scope}-${row.pos}`;
	store
		.handle()
		.prepare(INSERT_NOTE)
		.run(
			`id-${row.scope}-${row.pos}`,
			row.scope,
			row.pos,
			row.state ?? "live",
			row.kind ?? "note",
			row.body,
			row.longform ?? null,
			ts,
			ts,
			ts,
			row.review_at ?? null,
			version,
			version,
		);
}

function addNode(
	store: Store,
	scope: string,
	node: {
		readonly level: number;
		readonly start: number;
		readonly summary: string;
		readonly a_key: string | null;
		readonly b_key: string | null;
	},
): void {
	store
		.handle()
		.prepare(
			`INSERT INTO nodes (scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key)
			VALUES (?, ?, ?, ?, '2026-11-01T00:00:00.000Z', '2026-11-02T00:00:00.000Z', ?, ?, ?)`,
		)
		.run(
			scope,
			node.level,
			node.start,
			node.summary,
			`build-${node.level}-${node.start}`,
			node.a_key,
			node.b_key,
		);
}

const leafKey = (scope: string, pos: number): string =>
	`v-${scope}-${pos}|live`;

describe("openNote", () => {
	const longform = "x".repeat(LONGFORM_ALL + 100);

	it("gives the head, the whole document, and the offset continuation", () => {
		const store = newStore();
		addNote(store, {
			scope: "x:a",
			pos: 0,
			body: "first",
			longform,
			ts: "2026-11-01T00:00:00.000Z",
		});
		const note = byAddress(store, "x:a" as ScopeKey, 0);
		if (note === null) throw new Error("Fixture note is absent");
		const head = openNote("x:a" as ScopeKey, note);
		expect(head.kind).toBe("entry");
		expect(head.addr).toBe("x:a#0");
		expect(head.body).toBe("first");
		expect(head.longform).toHaveLength(LONGFORM_HEAD);
		expect(head.longformTruncated).toBe(true);
		expect(head.longformChars).toBe(LONGFORM_ALL + 100);
		expect(head.longformOffset).toBe(LONGFORM_HEAD);
		const next = openNote("x:a" as ScopeKey, note, "head", head.longformOffset);
		expect(next.longformOffset).toBe(LONGFORM_HEAD * 2);
		expect(next.longformTruncated).toBe(true);
		const last = openNote("x:a" as ScopeKey, note, "all", LONGFORM_HEAD * 2);
		expect(last.longformOffset).toBe(LONGFORM_ALL + 100);
		expect(last.longformTruncated).toBe(false);
		const all = openNote("x:a" as ScopeKey, note, "all");
		expect(all.longform).toHaveLength(LONGFORM_ALL);
		const none = openNote("x:a" as ScopeKey, note, "none");
		expect(none.longform).toBeUndefined();
		expect(none.longformChars).toBe(LONGFORM_ALL + 100);
	});
});

describe("openRange", () => {
	it("gives record lines for an aligned range of single positions", () => {
		const store = newStore();
		addNote(store, {
			scope: "x:a",
			pos: 0,
			body: "first",
			ts: "2026-11-01T00:00:00.000Z",
		});
		addNote(store, {
			scope: "x:a",
			pos: 1,
			body: "second",
			ts: "2026-11-02T00:00:00.000Z",
		});
		expect(
			openRange(
				"x:a" as ScopeKey,
				loadView(store.handle(), "x:a" as ScopeKey),
				0,
				1,
			),
		).toEqual({
			kind: "children",
			children: [
				{
					addr: "x:a#0",
					ts_from: "2026-11-01T00:00:00.000Z",
					ts_to: "2026-11-01T00:00:00.000Z",
					text: "first",
					built: true,
					chars: 5,
				},
				{
					addr: "x:a#1",
					ts_from: "2026-11-02T00:00:00.000Z",
					ts_to: "2026-11-02T00:00:00.000Z",
					text: "second",
					built: true,
					chars: 6,
				},
			],
		});
	});

	it("gives a valid summary half and a temporary half", () => {
		const store = newStore();
		addNote(store, {
			scope: "x:a",
			pos: 0,
			body: "first",
			ts: "2026-11-01T00:00:00.000Z",
		});
		addNote(store, {
			scope: "x:a",
			pos: 1,
			body: "second",
			ts: "2026-11-02T00:00:00.000Z",
		});
		addNote(store, {
			scope: "x:a",
			pos: 2,
			body: "third",
			ts: "2026-11-03T00:00:00.000Z",
		});
		addNode(store, "x:a", {
			level: 1,
			start: 0,
			summary: "first two",
			a_key: leafKey("x:a", 0),
			b_key: leafKey("x:a", 1),
		});
		const view = loadView(store.handle(), "x:a" as ScopeKey);
		expect(openRange("x:a" as ScopeKey, view, 0, 3)).toEqual({
			kind: "children",
			children: [
				{
					addr: "x:a#0-1",
					ts_from: "2026-11-01T00:00:00.000Z",
					ts_to: "2026-11-02T00:00:00.000Z",
					text: "first two",
					built: true,
					chars: 9,
				},
				{
					addr: "x:a#2-3",
					ts_from: "2026-11-03T00:00:00.000Z",
					ts_to: "2026-11-03T00:00:00.000Z",
					text: "third",
					built: false,
					chars: 5,
				},
			],
		});
		store
			.handle()
			.prepare(
				"UPDATE notes SET body = 'changed', v_content = 'v2' WHERE pos = 0",
			)
			.run();
		const changed = loadView(store.handle(), "x:a" as ScopeKey);
		expect(openRange("x:a" as ScopeKey, changed, 0, 3).children[0]).toEqual({
			addr: "x:a#0-1",
			ts_from: "2026-11-01T00:00:00.000Z",
			ts_to: "2026-11-02T00:00:00.000Z",
			text: "changed; second",
			built: false,
			chars: 15,
		});
	});

	it("gives one line for a range without node geometry and none for an empty range", () => {
		const store = newStore();
		addNote(store, {
			scope: "x:a",
			pos: 0,
			body: "first",
			ts: "2026-11-01T00:00:00.000Z",
		});
		addNote(store, {
			scope: "x:a",
			pos: 1,
			body: "second",
			ts: "2026-11-02T00:00:00.000Z",
		});
		const view = loadView(store.handle(), "x:a" as ScopeKey);
		expect(openRange("x:a" as ScopeKey, view, 1, 2).children).toEqual([
			{
				addr: "x:a#1",
				ts_from: "2026-11-02T00:00:00.000Z",
				ts_to: "2026-11-02T00:00:00.000Z",
				text: "second",
				built: false,
				chars: 6,
			},
		]);
		expect(openRange("x:a" as ScopeKey, view, 8, 9).children).toEqual([]);
		expect(openRange("x:a" as ScopeKey, view, 2, 3).children).toEqual([]);
	});
});

describe("dueRecords and scopeLines", () => {
	const fixture = () => {
		const store = newStore();
		addNote(store, {
			scope: "x:a",
			pos: 0,
			body: "old decision",
			review_at: "2026-01-01",
		});
		addNote(store, {
			scope: "x:a",
			pos: 1,
			body: "fresh task",
			review_at: "2026-12-01",
			kind: "task",
		});
		addNote(store, {
			scope: "x:b",
			pos: 0,
			body: "due fact",
			review_at: "2026-11-10",
			ts: "2026-11-05T00:00:00.000Z",
			kind: "fact",
		});
		addNote(store, { scope: "x:c", pos: 0, body: "no review" });
		addNote(store, {
			scope: "x:a",
			pos: 2,
			body: "later decision",
			review_at: "2026-12-15",
		});
		return store;
	};

	it("lists the due notes of each visible scope in date order", () => {
		const store = fixture();
		expect(
			dueRecords(store, null, "2026-11-10").map((item) => item.body),
		).toEqual(["old decision", "due fact"]);
		expect(dueRecords(store, ["x:b" as ScopeKey], "2026-11-10")).toEqual([
			{
				addr: "x:b#0",
				scope: "x:b",
				pos: 0,
				ts: "2026-11-05T00:00:00.000Z",
				kind: "fact",
				body: "due fact",
				review_at: "2026-11-10",
			},
		]);
		expect(dueRecords(store, null, "2025-12-31")).toEqual([]);
	});

	it("keeps one kind through the due and upcoming lists", () => {
		const store = fixture();
		expect(
			dueRecords(store, null, "2026-11-10", "fact").map((item) => item.body),
		).toEqual(["due fact"]);
		expect(dueRecords(store, null, "2026-11-10", "task")).toEqual([]);
		const task = upcomingRecords(store, null, "2026-11-10", 10, "task");
		expect(task.records.map((item) => item.body)).toEqual(["fresh task"]);
		expect(task.total).toBe(1);
	});

	it("lists the upcoming notes in date order under the limit", () => {
		const store = fixture();
		expect(
			upcomingRecords(store, null, "2026-11-10", 10).records.map(
				(item) => item.body,
			),
		).toEqual(["fresh task", "later decision"]);
		const one = upcomingRecords(store, null, "2026-11-10", 1);
		expect(one.records.map((item) => item.body)).toEqual(["fresh task"]);
		expect(one.total).toBe(2);
		expect(upcomingRecords(store, null, "2026-12-31", 10)).toEqual({
			records: [],
			total: 0,
		});
	});

	it("compares an older date value with a full review time", () => {
		const store = newStore();
		addNote(store, {
			scope: "x:a",
			pos: 0,
			body: "date due",
			review_at: "2026-11-10",
		});
		addNote(store, {
			scope: "x:a",
			pos: 1,
			body: "time due",
			review_at: "2026-11-10T09:00:00.000Z",
		});
		expect(
			dueRecords(store, null, "2026-11-10T12:00:00.000Z").map(
				(item) => item.body,
			),
		).toEqual(["date due", "time due"]);
		expect(
			upcomingRecords(store, null, "2026-11-10T08:00:00.000Z", 10).records.map(
				(item) => item.body,
			),
		).toEqual(["time due"]);
	});

	it("lists each scope with its live count and its last write date", () => {
		const store = fixture();
		// The fixture writes each note at midnight in UTC, and the line shows that day in the zone.
		const day = dayOf("2026-11-01T00:00:00.000Z");
		expect(scopeLines(store, null)).toEqual([
			{ key: "x:a", notes: 3, lastSeen: day },
			{ key: "x:b", notes: 1, lastSeen: dayOf("2026-11-05T00:00:00.000Z") },
			{ key: "x:c", notes: 1, lastSeen: day },
		]);
		expect(
			scopeLines(store, ["x:c" as ScopeKey]).map((line) => line.key),
		).toEqual(["x:c"]);
	});
});
