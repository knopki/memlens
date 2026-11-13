/**
 * #region moduleContract
 * @purpose Check the row view of one scope: the load, the validity keys, the join, and the slice lines.
 * @scope A real store built by raw SQL rows, the frontier, and the top line of a scope.
 * @invariants Each fixture writes the rows that the test reads, so no projection is involved.
 * @keywords test, view, slice, node, validity, join, temporary, frontier
 * #endregion moduleContract
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { LINE_LIMIT } from "../src/domain/tree.js";
import { Store } from "../src/store/store.js";
import type { Node } from "../src/store/types.js";
import {
	joinText,
	loadView,
	nodeValid,
	sliceOf,
	topLineOf,
} from "../src/store/view.js";
import type { ScopeKey } from "../src/types/events.js";

const SCOPE = "p:x" as ScopeKey;
const T0 = "2026-01-01T00:00:00.000Z";

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** @purpose Open one empty store in a temporary directory. */
function newStore(): Store {
	const dir = mkdtempSync(join(tmpdir(), "memlens-view-"));
	dirs.push(dir);
	return new Store(dir);
}

/** One note row of a test fixture. */
interface Row {
	readonly pos: number;
	readonly body: string;
	readonly state?: "live" | "hidden" | "deleted";
	readonly ts?: string;
	readonly longform?: string | null;
}

const INSERT_NOTE = `INSERT INTO notes
	(id, scope, pos, state, kind, body, longform, refs, ts, created_at, modified_at, review_at, v, v_content)
	VALUES (?, ?, ?, ?, 'note', ?, ?, '[]', ?, ?, ?, NULL, ?, ?)`;

/** @purpose Add one note row by raw SQL, with a version that names the slot and the body. */
function addNote(store: Store, row: Row): void {
	const ts = row.ts ?? T0;
	const version = `v-${row.pos}-${row.body.length}`;
	store
		.handle()
		.prepare(INSERT_NOTE)
		.run(
			`id-${row.pos}`,
			SCOPE,
			row.pos,
			row.state ?? "live",
			row.body,
			row.longform ?? null,
			ts,
			ts,
			ts,
			version,
			version,
		);
}

const INSERT_NODE = `INSERT INTO nodes
	(scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** @purpose Add one node row by raw SQL. */
function addNode(
	store: Store,
	node: Pick<Node, "level" | "start" | "summary" | "a_key" | "b_key"> & {
		readonly built_v?: string;
	},
): void {
	store
		.handle()
		.prepare(INSERT_NODE)
		.run(
			SCOPE,
			node.level,
			node.start,
			node.summary,
			T0,
			T0,
			node.built_v ?? `build-${node.level}-${node.start}`,
			node.a_key,
			node.b_key,
		);
}

/** @purpose Give the validity key of one live leaf: the version and the state. */
const leafKey = (pos: number, body: string): string =>
	`v-${pos}-${body.length}|live`;

/** @purpose Give the body of one fixture note. */
const body = (pos: number): string => `body ${pos}`;

/** @purpose Write one live note for each position of a range. */
function addLive(store: Store, count: number): void {
	for (let pos = 0; pos < count; pos += 1)
		addNote(store, { pos, body: body(pos) });
}

/** @purpose Add the leaf pair node over slots 0 and 1. */
function addPair(store: Store, summary = "pair"): void {
	addNode(store, {
		level: 1,
		start: 0,
		summary,
		a_key: leafKey(0, body(0)),
		b_key: leafKey(1, body(1)),
	});
}

describe("loadView", () => {
	it("gives each note row in slot order and each node row by level and start", () => {
		const store = newStore();
		addNote(store, { pos: 1, body: "second" });
		addNote(store, { pos: 0, body: "first", state: "hidden" });
		addPair(store);
		addNode(store, {
			level: 2,
			start: 0,
			summary: "root",
			a_key: "x",
			b_key: null,
		});
		const view = loadView(store.handle(), SCOPE);
		expect(view.notes.map((row) => [row.pos, row.state])).toEqual([
			[0, "hidden"],
			[1, "live"],
		]);
		expect(view.nodes.map((row) => [row.level, row.start])).toEqual([
			[1, 0],
			[2, 0],
		]);
		expect(loadView(store.handle(), "q:y" as ScopeKey)).toEqual({
			scope: "q:y",
			notes: [],
			nodes: [],
		});
	});
});

describe("nodeValid", () => {
	it("accepts a node whose halves match the rows", () => {
		const store = newStore();
		addLive(store, 2);
		addPair(store);
		const view = loadView(store.handle(), SCOPE);
		expect(nodeValid(view, view.nodes[0] as Node)).toBe(true);
	});

	it("refuses a changed note and a hidden note", () => {
		const store = newStore();
		addLive(store, 2);
		addPair(store);
		store
			.handle()
			.prepare(
				"UPDATE notes SET body = 'changed', v_content = 'v2' WHERE pos = 0",
			)
			.run();
		const changed = loadView(store.handle(), SCOPE);
		expect(nodeValid(changed, changed.nodes[0] as Node)).toBe(false);
		store
			.handle()
			.prepare("UPDATE notes SET state = 'hidden' WHERE pos = 0")
			.run();
		const hidden = loadView(store.handle(), SCOPE);
		expect(nodeValid(hidden, hidden.nodes[0] as Node)).toBe(false);
	});

	it("refuses a null half that holds a live note and a node half with no child row", () => {
		const store = newStore();
		addNote(store, { pos: 0, body: body(0) });
		addNote(store, { pos: 1, body: body(1), state: "hidden" });
		addNode(store, {
			level: 1,
			start: 0,
			summary: "pair",
			a_key: leafKey(0, body(0)),
			b_key: null,
		});
		const view = loadView(store.handle(), SCOPE);
		expect(nodeValid(view, view.nodes[0] as Node)).toBe(true);
		addNode(store, {
			level: 2,
			start: 0,
			summary: "root",
			a_key: "missing",
			b_key: null,
		});
		const root = loadView(store.handle(), SCOPE).nodes[1] as Node;
		expect(nodeValid(loadView(store.handle(), SCOPE), root)).toBe(false);
		store
			.handle()
			.prepare("UPDATE nodes SET a_key = NULL WHERE level = 1")
			.run();
		const nullHalf = loadView(store.handle(), SCOPE);
		expect(nodeValid(nullHalf, nullHalf.nodes[0] as Node)).toBe(false);
	});
});

describe("sliceOf", () => {
	it("renders the summary of a valid node", () => {
		const store = newStore();
		addLive(store, 3);
		addPair(store, "first pair");
		const lines = sliceOf(loadView(store.handle(), SCOPE), 2);
		expect(lines).toEqual([
			{
				kind: "summary",
				range: { start: 0, level: 1 },
				from: T0,
				to: T0,
				summary: "first pair",
			},
			{ kind: "record", pos: 2, from: T0, to: T0, body: body(2) },
		]);
	});

	it("gives no stale text for a hidden note", () => {
		const store = newStore();
		addLive(store, 2);
		addPair(store, "stale pair");
		store
			.handle()
			.prepare("UPDATE notes SET state = 'hidden' WHERE pos = 0")
			.run();
		const lines = sliceOf(loadView(store.handle(), SCOPE), 2);
		expect(lines).toEqual([
			{ kind: "record", pos: 1, from: T0, to: T0, body: body(1) },
		]);
	});

	it("gives a temporary cut text when a note changes under a node", () => {
		const store = newStore();
		addLive(store, 3);
		addPair(store, "stale pair");
		store
			.handle()
			.prepare(
				"UPDATE notes SET body = 'changed', v_content = 'v2' WHERE pos = 0",
			)
			.run();
		const lines = sliceOf(loadView(store.handle(), SCOPE), 2);
		expect(lines[0]).toEqual({
			kind: "temporary",
			range: { start: 0, level: 1 },
			from: T0,
			to: T0,
			text: "changed; body 1",
		});
	});

	it("cuts a long temporary text at the line limit and a word boundary", () => {
		const store = newStore();
		const long = "word ".repeat(200).trim();
		addNote(store, { pos: 0, body: long });
		addNote(store, { pos: 1, body: long });
		addNote(store, { pos: 2, body: body(2) });
		const lines = sliceOf(loadView(store.handle(), SCOPE), 2);
		const line = lines[0];
		expect(line?.kind).toBe("temporary");
		const text = line?.kind === "temporary" ? line.text : "";
		expect(text.length).toBeLessThanOrEqual(LINE_LIMIT);
		expect(text.endsWith("word")).toBe(true);
	});

	it("walks to the leaves when the children also lack rows", () => {
		const store = newStore();
		addLive(store, 5);
		const lines = sliceOf(loadView(store.handle(), SCOPE), 2);
		expect(lines.map((line) => line.kind)).toEqual(["temporary", "record"]);
		expect(lines[0]).toMatchObject({
			range: { start: 0, level: 2 },
			text: "body 0; body 1; body 2; body 3",
		});
		expect(lines[1]).toMatchObject({ kind: "record", pos: 4 });
	});

	it("respects the budget and keeps the newest range", () => {
		const store = newStore();
		addLive(store, 8);
		for (const budget of [0, 1, 2, 3, 4]) {
			const lines = sliceOf(loadView(store.handle(), SCOPE), budget);
			expect(lines.length).toBeLessThanOrEqual(Math.max(1, budget));
			const last = lines.at(-1);
			expect(last?.kind === "record" ? last.pos : -1).toBe(7);
		}
		expect(sliceOf(loadView(store.handle(), SCOPE), 8)).toHaveLength(8);
	});

	it("gives no line for a scope with no live note", () => {
		const store = newStore();
		addNote(store, { pos: 0, body: "gone", state: "deleted" });
		expect(sliceOf(loadView(store.handle(), SCOPE), 4)).toEqual([]);
		expect(topLineOf(loadView(store.handle(), SCOPE))).toBeNull();
	});
});

describe("topLineOf", () => {
	it("gives the top summary of a valid root and the text of a range without a row", () => {
		const store = newStore();
		addLive(store, 2);
		addPair(store, "root pair");
		expect(topLineOf(loadView(store.handle(), SCOPE))).toEqual({
			kind: "summary",
			range: { start: 0, level: 1 },
			from: T0,
			to: T0,
			summary: "root pair",
		});
		addNote(store, { pos: 2, body: body(2) });
		expect(topLineOf(loadView(store.handle(), SCOPE))).toMatchObject({
			kind: "temporary",
			range: { start: 0, level: 2 },
			text: "root pair; body 2",
		});
	});
});

describe("joinText", () => {
	it("reports a fitting pair and cuts a pair above the limit", () => {
		expect(joinText("a", "b")).toEqual({ text: "a; b", fits: true });
		expect(joinText("", "b")).toEqual({ text: "b", fits: true });
		const long = "x".repeat(LINE_LIMIT);
		const cut = joinText(long, "b");
		expect(cut.fits).toBe(false);
		expect(cut.text.length).toBeLessThanOrEqual(LINE_LIMIT);
		const pair = joinText("a".repeat(600), "b".repeat(600));
		expect(pair.fits).toBe(false);
		expect(pair.text.length).toBeLessThanOrEqual(LINE_LIMIT);
	});
});
