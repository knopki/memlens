/**
 * #region moduleContract
 * @purpose Prove the console reader gives the same lines and counts as the full view.
 * @scope The frontier slice, the top line, the children of one range, the line count, the
 *   maintenance counts, the node batch of an unbuilt frontier, the longform text, and the unicode
 *   text.
 * @invariants A child line of the console equals the line that the open of the range gives.
 * @keywords test, console, reader, slice, top, children, maintenance, longform, unicode
 * #endregion moduleContract
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { openRange } from "../src/domain/reads.js";
import { LINE_LIMIT } from "../src/domain/tree.js";
import { publishJoin, readBuild } from "../src/store/build.js";
import { ConsoleReader } from "../src/store/console.js";
import { amend, hide, note, redact } from "../src/store/notes.js";
import { Store } from "../src/store/store.js";
import {
	candidatesOf,
	indexOf,
	loadView,
	nodeRowsOf,
	sliceOf,
	topLineOf,
} from "../src/store/view.js";
import type { ScopeKey } from "../src/types/primitives.js";

const TIME = "2026-11-19T10:00:00.000Z";

const BUDGETS = [1, 2, 3, 5, 8, 16];

const RANGES: readonly (readonly [number, number])[] = [
	[0, 1],
	[2, 3],
	[0, 3],
	[4, 7],
	[0, 7],
	[1, 2],
	[3, 5],
];

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

afterEach(() => vi.restoreAllMocks());

/** One call of a prepared statement, with the text that prepared it. */
interface StatementCall {
	readonly sql: string;
	readonly kind: "get" | "all";
}

/** Watch each prepare and each call of one test store, so a test counts reads. */
function watchStatements(store: Store): {
	readonly sql: string[];
	readonly calls: StatementCall[];
} {
	const db = store.handle();
	const original = db.prepare.bind(db);
	const sql: string[] = [];
	const calls: StatementCall[] = [];
	vi.spyOn(db, "prepare").mockImplementation(((text: string) => {
		const normalized = text.replace(/\s+/g, " ");
		sql.push(normalized);
		const statement = original(text) as unknown as {
			get: (...args: unknown[]) => unknown;
			all: (...args: unknown[]) => unknown;
		};
		return {
			get: (...args: unknown[]) => {
				calls.push({ sql: normalized, kind: "get" });
				return statement.get(...args);
			},
			all: (...args: unknown[]) => {
				calls.push({ sql: normalized, kind: "all" });
				return statement.all(...args);
			},
		} as unknown as ReturnType<typeof db.prepare>;
	}) as typeof db.prepare);
	return { sql, calls };
}

/** Watch each statement that one test store prepares. */
function watchSql(store: Store): { readonly sql: string[] } {
	const db = store.handle();
	const original = db.prepare.bind(db);
	const sql: string[] = [];
	vi.spyOn(db, "prepare").mockImplementation(((text: string) => {
		sql.push(text.replace(/\s+/g, " "));
		return original(text);
	}) as typeof db.prepare);
	return { sql };
}

function newStore(): Store {
	const dir = mkdtempSync(join(tmpdir(), "memlens-console-reader-"));
	dirs.push(dir);
	return new Store(dir);
}

function addNote(
	store: Store,
	scope: ScopeKey,
	pos: number,
	body: string,
	longform: string | null = null,
): void {
	const saved = note(store, {
		id: `note-${scope}-${pos}`,
		scope,
		kind: "note",
		body,
		longform,
		ts: TIME,
		session: "test",
		turn: "test",
		preset: "test",
	});
	expect(saved.ok).toBe(true);
}

/** Write one note row with an exact time, so the slot order differs from the time order. */
function addRaw(store: Store, scope: ScopeKey, pos: number, ts: string): void {
	store
		.handle()
		.prepare(
			`INSERT INTO notes
			(id, scope, pos, state, kind, body, refs, ts, created_at, modified_at, v, v_content)
			VALUES (?, ?, ?, 'live', 'note', ?, '[]', ?, ?, ?, ?, ?)`,
		)
		.run(
			`note-${scope}-${pos}`,
			scope,
			pos,
			`note ${pos}`,
			ts,
			ts,
			ts,
			`v-${scope}-${pos}`,
			`v-${scope}-${pos}`,
		);
}

function addLive(store: Store, scope: ScopeKey, count: number): void {
	for (let pos = 0; pos < count; pos += 1)
		addNote(store, scope, pos, `note ${pos}`);
}

function buildAll(store: Store, scope: ScopeKey, count: number): void {
	for (let level = 1; level <= Math.log2(count); level += 1) {
		for (let start = 0; start < count; start += 2 ** level) {
			const read = readBuild(store, scope, level, start);
			if (!read.ok) continue;
			expect(publishJoin(store, scope, level, start, read).ok).toBe(true);
		}
	}
}

function expectSameLines(store: Store, scope: ScopeKey): void {
	const db = store.handle();
	const view = loadView(db, scope);
	const reader = new ConsoleReader(db, scope);
	for (const budget of BUDGETS) {
		expect(reader.slice(budget)).toEqual(sliceOf(view, budget));
		expect(reader.lineCount(budget)).toBe(sliceOf(view, budget).length);
	}
	expect(reader.top()).toEqual(topLineOf(view));
}

function expectSameChildren(store: Store, scope: ScopeKey): void {
	const db = store.handle();
	const view = loadView(db, scope);
	const reader = new ConsoleReader(db, scope);
	for (const [start, end] of RANGES) {
		expect(reader.children(start, end).children).toEqual(
			openRange(scope, view, start, end).children,
		);
	}
}

function expectSameMaintenance(store: Store, scope: ScopeKey): void {
	const db = store.handle();
	const reader = new ConsoleReader(db, scope);
	const stats = reader.maintenance();
	const index = indexOf(loadView(db, scope));
	const rows = nodeRowsOf(index);
	const candidates = candidatesOf(index);
	const levels = [
		...new Set([
			...rows.map((row) => row.node.level),
			...candidates.map((range) => range.level),
		]),
	]
		.sort((a, b) => a - b)
		.map((level) => ({
			level,
			nodes: rows.filter((row) => row.node.level === level).length,
			dirty: rows.filter((row) => row.node.level === level && !row.clean)
				.length,
			candidates: candidates.filter((range) => range.level === level).length,
		}));
	expect(stats).toEqual({
		nodes: rows.length,
		levels,
		candidates,
	});
}

it("gives the frontier, the top line, and the children of clean nodes", () => {
	const store = newStore();
	const scope: ScopeKey = "project:a";
	addLive(store, scope, 8);
	buildAll(store, scope, 8);
	expectSameLines(store, scope);
	expectSameChildren(store, scope);
	expectSameMaintenance(store, scope);
	expect(new ConsoleReader(store.handle(), scope).top()?.kind).toBe("summary");
	const watch = watchSql(store);
	new ConsoleReader(store.handle(), scope).maintenance();
	expect(watch.sql.some((sql) => /v_content/.test(sql))).toBe(true);
});

it("gives the temporary line of a changed node and a stale key", () => {
	const store = newStore();
	const scope: ScopeKey = "project:a";
	addLive(store, scope, 8);
	buildAll(store, scope, 8);
	amend(store, { id: `note-${scope}-1`, body: "changed one" });
	store
		.handle()
		.prepare("UPDATE notes SET v_content = 'stale' WHERE pos = 6")
		.run();
	expectSameLines(store, scope);
	expectSameChildren(store, scope);
	expectSameMaintenance(store, scope);
	expect(new ConsoleReader(store.handle(), scope).top()?.kind).toBe(
		"temporary",
	);
});

it("gives the same lines across a hidden and a deleted slot", () => {
	const store = newStore();
	const scope: ScopeKey = "project:a";
	addLive(store, scope, 8);
	buildAll(store, scope, 8);
	hide(store, `note-${scope}-3`);
	redact(store, `note-${scope}-5`, "test");
	expectSameLines(store, scope);
	expectSameChildren(store, scope);
	expectSameMaintenance(store, scope);
});

it("gives no top line when the scope shows no live note", () => {
	const store = newStore();
	const scope: ScopeKey = "project:a";
	addLive(store, scope, 2);
	hide(store, `note-${scope}-0`);
	hide(store, `note-${scope}-1`);
	expectSameLines(store, scope);
	expect(new ConsoleReader(store.handle(), scope).top()).toBeNull();
	expectSameMaintenance(store, scope);
});

it("keeps the range dates in slot order with an unordered time", () => {
	const store = newStore();
	const scope: ScopeKey = "project:a";
	addRaw(store, scope, 0, "2026-11-04T00:00:00.000Z");
	addRaw(store, scope, 1, "2026-11-03T00:00:00.000Z");
	addRaw(store, scope, 2, "2026-11-02T00:00:00.000Z");
	addRaw(store, scope, 3, "2026-11-01T00:00:00.000Z");
	expectSameLines(store, scope);
	expectSameChildren(store, scope);
	const top = new ConsoleReader(store.handle(), scope).top();
	expect(top?.kind === "temporary" ? top.from : "").toBe(
		"2026-11-04T00:00:00.000Z",
	);
	expect(top?.kind === "temporary" ? top.to : "").toBe(
		"2026-11-01T00:00:00.000Z",
	);
});

it("keeps the longform text and the unicode text of a temporary line", () => {
	const store = newStore();
	const scope: ScopeKey = "project:u";
	addNote(store, scope, 0, "тело ноль", "документ ноль");
	addNote(store, scope, 1, "😀 emoji");
	addNote(store, scope, 2, "х".repeat(700));
	expectSameLines(store, scope);
	expectSameMaintenance(store, scope);
	const reader = new ConsoleReader(store.handle(), scope);
	const top = reader.top();
	expect(top?.kind).toBe("temporary");
	const text = top?.kind === "temporary" ? top.text : "";
	expect(text).toContain("тело ноль\nдокумент ноль");
	expect(text).toContain("😀");
	expect(text.length).toBeLessThanOrEqual(LINE_LIMIT);
	expect(reader.line({ start: 0, level: 0 })).toEqual({
		kind: "record",
		pos: 0,
		from: TIME,
		to: TIME,
		body: "тело ноль",
	});
});

it("keeps the joined text of an unaligned range with a longform", () => {
	const store = newStore();
	const scope: ScopeKey = "project:l";
	addNote(store, scope, 0, "first");
	addNote(store, scope, 1, "тело", "док".repeat(800));
	addNote(store, scope, 2, "third");
	addNote(store, scope, 3, "fourth");
	addNote(store, scope, 4, "пятый", "док");
	expectSameChildren(store, scope);
	const text =
		new ConsoleReader(store.handle(), scope).children(1, 2).children[0]?.text ??
		"";
	expect(text.startsWith("тело\nдок")).toBe(true);
	expect(text.length).toBeLessThanOrEqual(LINE_LIMIT);
});

it("keeps the text after an embedded NUL of a temporary line", () => {
	const store = newStore();
	const scope: ScopeKey = "project:n";
	addNote(store, scope, 0, "ab\u0000cd");
	addNote(store, scope, 1, "zz");
	expectSameLines(store, scope);
	const top = new ConsoleReader(store.handle(), scope).top();
	expect(top?.kind === "temporary" ? top.text : "").toBe("ab\u0000cd; zz");
});

it("counts the maintenance rows without a leaf key read for a scope of no node", () => {
	const store = newStore();
	const scope: ScopeKey = "project:a";
	addLive(store, scope, 4);
	const watch = watchSql(store);
	const stats = new ConsoleReader(store.handle(), scope).maintenance();
	expect(stats).toEqual({
		nodes: 0,
		levels: [
			{ level: 1, nodes: 0, dirty: 0, candidates: 2 },
			{ level: 2, nodes: 0, dirty: 0, candidates: 1 },
		],
		candidates: [
			{ start: 0, level: 1 },
			{ start: 2, level: 1 },
			{ start: 0, level: 2 },
		],
	});
	expect(watch.sql.filter((sql) => /v_content/.test(sql))).toEqual([]);
});

it("reads the node rows of an unbuilt frontier in one batch", () => {
	const store = newStore();
	const scope: ScopeKey = "project:a";
	addLive(store, scope, 32);
	const view = loadView(store.handle(), scope);
	const watch = watchStatements(store);
	const lines = new ConsoleReader(store.handle(), scope).slice(8);
	expect(lines).toEqual(sliceOf(view, 8));
	expect(lines.map((line) => line.kind)).toEqual([
		"temporary",
		"temporary",
		"temporary",
		"temporary",
		"temporary",
		"temporary",
		"record",
		"record",
	]);
	const nodeSql = watch.sql.filter((sql) =>
		/FROM nodes WHERE scope = \?/.test(sql),
	);
	const batch = nodeSql.filter((sql) => /ORDER BY level, start/.test(sql));
	const point = nodeSql.filter((sql) =>
		/AND level = \? AND start = \?/.test(sql),
	);
	expect(batch).toHaveLength(1);
	expect(point).toHaveLength(1);
	expect(
		watch.calls.filter(
			(call) => call.kind === "all" && /FROM nodes/.test(call.sql),
		),
	).toHaveLength(1);
	expect(
		watch.calls.filter(
			(call) => call.kind === "get" && /FROM nodes/.test(call.sql),
		),
	).toHaveLength(1);
	// The six temporary lines cover 30 leaves, and the two newest lines are records.
	expect(
		watch.calls.filter((call) => /substr\(CAST\(body/.test(call.sql)),
	).toHaveLength(30);
	expect(
		watch.calls.filter((call) => /SELECT body, ts FROM notes/.test(call.sql)),
	).toHaveLength(2);
	expect(
		watch.calls.filter((call) => /SELECT 1 FROM notes/.test(call.sql)),
	).toEqual([]);
	expect(new ConsoleReader(store.handle(), scope).slice(4)).toEqual(
		sliceOf(view, 4),
	);
});
