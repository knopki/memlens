/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prove the search with its filters and the read models against the real store engine.
 * @scope The prefix match, the find filters, the hit order, the hidden row, the tie order, the trigram
 *   fallback, the due list, and the directions block.
 * @invariants Each test reads rows that the test wrote by raw SQL, except the move test, which
 *   writes through the note API.
 * @invariants The file pins the zone to Europe/Moscow before the search tests.
 * @keywords test, search, find, filter, fts, trigram, read, due, directions
 * #endregion moduleContract
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, it, vi } from "vitest";
import { amend, note } from "../src/store/notes.js";
import {
	byAddress,
	byId,
	directionsData,
	dueReviews,
	liveCounts,
	newestScope,
	nodesOf,
	scopeNotes,
} from "../src/store/reads.js";
import {
	FIND_DEFAULT_LIMIT,
	type FindFilter,
	search,
} from "../src/store/search.js";
import { Store } from "../src/store/store.js";
import type { ScopeKey } from "../src/types/primitives.js";

vi.hoisted(() => {
	process.env.TZ = "Europe/Moscow";
});

const T0 = "2026-01-01T00:00:00.000Z";

const T1 = "2026-02-01T00:00:00.000Z";

const T2 = "2026-03-01T00:00:00.000Z";

const T3 = "2026-04-01T00:00:00.000Z";

const NOW = "2026-03-15T00:00:00.000Z";

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function newStore(language = "en"): Store {
	const dir = mkdtempSync(join(tmpdir(), "memlens-"));
	dirs.push(dir);
	return new Store(dir, language);
}

/** One note fixture of a test. */
interface Row {
	readonly id: string;
	readonly pos: number;
	readonly body: string;
	readonly scope?: string;
	readonly state?: "live" | "hidden" | "deleted";
	readonly kind?: string;
	readonly ts?: string;
	readonly modified_at?: string;
	readonly review_at?: string | null;
	readonly longform?: string | null;
	readonly refs?: string;
}

const INSERT_NOTE = `INSERT INTO notes
	(id, scope, pos, state, kind, body, longform, refs, ts, created_at, modified_at, review_at, v, v_content)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function addNote(store: Store, row: Row): void {
	store
		.handle()
		.prepare(INSERT_NOTE)
		.run(
			row.id,
			row.scope ?? "p:x",
			row.pos,
			row.state ?? "live",
			row.kind ?? "note",
			row.body,
			row.longform ?? null,
			row.refs ?? "[]",
			row.ts ?? T0,
			row.ts ?? T0,
			row.modified_at ?? row.ts ?? T0,
			row.review_at ?? null,
			"v",
			"v",
		);
}

function indexNote(
	store: Store,
	id: string,
	body: string,
	longform: string | null = null,
): void {
	const db = store.handle();
	const row = db.prepare("SELECT n FROM notes WHERE id = ?").get(id);
	assert.ok(row !== undefined, `note ${id} exists`);
	db.prepare("INSERT INTO fts (rowid, body, longform) VALUES (?, ?, ?)").run(
		Number(row.n),
		body,
		longform,
	);
}

function addNode(
	store: Store,
	scope: string,
	level: number,
	start: number,
	summary: string,
): void {
	store
		.handle()
		.prepare(
			"INSERT INTO nodes (scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key) VALUES (?, ?, ?, ?, ?, ?, 'v', NULL, NULL)",
		)
		.run(scope, level, start, summary, T0, T0);
}

// #region FUNC_test_search
/**
 * @purpose Prove the match grammar, the live filter, the order, and the empty query.
 * @invariants Each call gives a limit of ten.
 */
describe("search", () => {
	const seek = (store: Store, query: string, scopes?: readonly ScopeKey[]) =>
		search(store, { query, limit: 10, scopes }, NOW);

	it("finds a word form by prefix", () => {
		const store = newStore();
		addNote(store, { id: "n1", pos: 0, body: "alphaprobe report" });
		indexNote(store, "n1", "alphaprobe report");
		const hits = seek(store, "alphap");
		assert.equal(hits.length, 1);
		assert.equal(hits[0]?.id, "n1");
		assert.equal(hits[0]?.addr, "p:x#0");
		assert.equal(hits[0]?.longformChars, 0);
	});

	it("records the longform length of a hit", () => {
		const store = newStore();
		addNote(store, {
			id: "n1",
			pos: 0,
			body: "betaprobe",
			longform: "0123456789",
		});
		indexNote(store, "n1", "betaprobe", "0123456789");
		const hits = seek(store, "betaprobe");
		assert.equal(hits[0]?.longformChars, 10);
	});

	it("applies the scope filter", () => {
		const store = newStore();
		addNote(store, { id: "n1", pos: 0, scope: "p:x", body: "gammaprobe" });
		addNote(store, { id: "n2", pos: 0, scope: "p:y", body: "gammaprobe" });
		indexNote(store, "n1", "gammaprobe");
		indexNote(store, "n2", "gammaprobe");
		const one = seek(store, "gammaprobe", ["p:x"]);
		assert.deepEqual(
			one.map((hit) => hit.scope),
			["p:x"],
		);
		const all = seek(store, "gammaprobe");
		assert.equal(all.length, 2);
	});

	it("returns no hit for a hidden row with a stale index row", () => {
		const store = newStore();
		addNote(store, {
			id: "n1",
			pos: 0,
			state: "hidden",
			body: "deltaprobe secret",
		});
		indexNote(store, "n1", "deltaprobe secret");
		addNote(store, { id: "n2", pos: 1, body: "deltaprobe live" });
		indexNote(store, "n2", "deltaprobe live");
		const hits = seek(store, "deltaprobe");
		assert.deepEqual(
			hits.map((hit) => hit.id),
			["n2"],
		);
	});

	it("breaks a full tie by id", () => {
		const store = newStore();
		addNote(store, { id: "id-b", pos: 0, body: "epsilonprobe" });
		addNote(store, { id: "id-a", pos: 1, body: "epsilonprobe" });
		indexNote(store, "id-b", "epsilonprobe");
		indexNote(store, "id-a", "epsilonprobe");
		const hits = seek(store, "epsilonprobe");
		assert.deepEqual(
			hits.map((hit) => hit.id),
			["id-a", "id-b"],
		);
	});

	it("gives no hit for an exclusion-only query", () => {
		const store = newStore();
		addNote(store, { id: "n1", pos: 0, body: "zetaprobe" });
		indexNote(store, "n1", "zetaprobe");
		assert.deepEqual(seek(store, "-zetaprobe"), []);
	});

	it("matches each live row for an empty query", () => {
		const store = newStore();
		addNote(store, { id: "n1", pos: 0, body: "etaprobe", ts: T1 });
		addNote(store, { id: "n2", pos: 1, body: "thetaprobe", ts: T2 });
		addNote(store, {
			id: "n3",
			pos: 2,
			state: "hidden",
			body: "hidden",
			ts: T3,
		});
		indexNote(store, "n1", "etaprobe");
		const hits = seek(store, "   ");
		assert.deepEqual(
			hits.map((hit) => hit.id),
			["n2", "n1"],
		);
	});
});
// #endregion FUNC_test_search

// #region FUNC_test_findFilters
/**
 * @purpose Prove that each filter cuts the rows before the limit, in one query over each scope.
 */
describe("find filters", () => {
	/** Give a time that is some minutes after T0. */
	const afterMinutes = (minutes: number): string =>
		new Date(Date.parse(T0) + minutes * 60_000).toISOString();

	/** Give the ids of the hits of one filter. */
	const idsOf = (store: Store, filter: FindFilter): string[] =>
		search(store, filter, NOW).map((hit) => hit.id);

	it("gives the newest rows of each scope in the time order, then cuts at the limit", () => {
		const store = newStore();
		for (let pos = 0; pos < 60; pos += 1)
			addNote(store, {
				id: `a${pos}`,
				pos,
				scope: "x:a",
				body: "row",
				ts: afterMinutes(pos),
			});
		for (let pos = 0; pos < 20; pos += 1)
			addNote(store, {
				id: `b${pos}`,
				pos,
				scope: "x:b",
				body: "row",
				ts: afterMinutes(pos + 40),
			});
		// An equal time keeps the scope order.
		assert.deepEqual(idsOf(store, { limit: 10 }), [
			"a59",
			"b19",
			"a58",
			"b18",
			"a57",
			"b17",
			"a56",
			"b16",
			"a55",
			"b15",
		]);
		assert.equal(search(store, {}, NOW).length, FIND_DEFAULT_LIMIT);
		assert.equal(idsOf(store, { limit: 100 }).length, 80);
		assert.deepEqual(idsOf(store, { limit: 0 }), []);
		assert.deepEqual(idsOf(store, { limit: -5 }), []);
	});

	it("applies the scope, kind, date, and due filters", () => {
		const store = newStore();
		addNote(store, {
			id: "n0",
			pos: 0,
			scope: "x:a",
			ts: "2026-11-01T12:00:00.000Z",
			body: "row",
		});
		addNote(store, {
			id: "n1",
			pos: 0,
			scope: "x:b",
			kind: "fact",
			ts: "2026-11-02T12:00:00.000Z",
			body: "row",
		});
		addNote(store, {
			id: "n2",
			pos: 1,
			scope: "x:a",
			ts: "2026-11-03T12:00:00.000Z",
			review_at: "2026-11-02",
			body: "row",
		});
		assert.deepEqual(idsOf(store, { scopes: ["x:a"] }), ["n2", "n0"]);
		// The order of the scope list does not order the hits.
		assert.deepEqual(idsOf(store, { scopes: ["x:b", "x:a"] }), [
			"n2",
			"n1",
			"n0",
		]);
		assert.deepEqual(idsOf(store, { kinds: ["fact"] }), ["n1"]);
		assert.deepEqual(idsOf(store, { since: "2026-11-02" }), ["n2", "n1"]);
		assert.deepEqual(idsOf(store, { until: "2026-11-02" }), ["n1", "n0"]);
		// The review time of n2 is before the tenth of November.
		const dueIds = (filter: FindFilter) =>
			search(store, filter, "2026-11-10T00:00:00.000Z").map((hit) => hit.id);
		assert.deepEqual(dueIds({ due: true }), ["n2"]);
		// The due filter combines with a date bound.
		assert.deepEqual(dueIds({ due: true, since: "2026-11-03" }), ["n2"]);
		assert.deepEqual(dueIds({ due: true, until: "2026-11-02" }), []);
	});

	it("compares a day bound with the day of the zone of the process", () => {
		const store = newStore();
		const times = [
			"2026-11-02T21:30:00.000Z",
			"2026-11-03T12:00:00.000Z",
			"2026-11-03T20:59:00.000Z",
			"2026-11-03T21:00:00.000Z",
		];
		for (const [pos, ts] of times.entries())
			addNote(store, { id: `n${pos}`, pos, body: "row", ts });
		// The day 2026-11-03 in Moscow starts at 21:00 in UTC of the day before.
		assert.deepEqual(
			search(store, { since: "2026-11-03", until: "2026-11-03" }, NOW).map(
				(hit) => hit.id,
			),
			["n2", "n1", "n0"],
		);
		assert.deepEqual(
			search(store, { since: "2026-11-03T12:00" }, NOW).map((hit) => hit.id),
			["n3", "n2", "n1"],
		);
	});

	it("finds a kind that the newest rows of the scope hide", () => {
		const store = newStore();
		for (let pos = 0; pos < 60; pos += 1) {
			addNote(store, {
				id: `n${pos}`,
				pos,
				body: "row fresh",
				ts: afterMinutes(pos + 1),
			});
			indexNote(store, `n${pos}`, "row fresh");
		}
		addNote(store, {
			id: "task",
			pos: 60,
			kind: "task",
			body: "row old",
			ts: T0,
		});
		indexNote(store, "task", "row old");
		// Without the kind filter the task row stays outside the first hit.
		assert.deepEqual(idsOf(store, { query: "row", limit: 1 }), ["n59"]);
		assert.deepEqual(idsOf(store, { kinds: ["task"] }), ["task"]);
		assert.deepEqual(idsOf(store, { query: "row", kinds: ["task"] }), ["task"]);
	});
});
// #endregion FUNC_test_findFilters

// #region FUNC_test_trigram
/**
 * @purpose Prove the literal fallback under the trigram tokenizer.
 */
describe("trigram", () => {
	it("finds a two-character CJK substring by literal containment", () => {
		const store = newStore("zh");
		assert.ok((store.meta("fts_tokenizer") ?? "").includes("trigram"));
		addNote(store, { id: "n1", pos: 0, body: "東京の会議" });
		indexNote(store, "n1", "東京の会議");
		const hits = search(store, { query: "東京", limit: 10 }, NOW);
		assert.deepEqual(
			hits.map((hit) => hit.id),
			["n1"],
		);
	});
});
// #endregion FUNC_test_trigram

// #region FUNC_test_reads
/**
 * @purpose Prove the note reads, the counts, the slot order, and the node order.
 */
describe("reads", () => {
	it("reads a note by address and by id", () => {
		const store = newStore();
		addNote(store, {
			id: "n1",
			pos: 0,
			scope: "p:x",
			body: "refs",
			refs: '["r1","r2"]',
		});
		addNote(store, { id: "n2", pos: 0, scope: "p:a", body: "other" });
		const note = byId(store, "n1");
		assert.ok(note !== null);
		assert.deepEqual(note.refs, ["r1", "r2"]);
		assert.equal(note.cleared, false);
		assert.equal(note.longform, null);
		assert.equal(byId(store, "absent"), null);
		const scoped = byAddress(store, "p:x", 0);
		assert.equal(scoped?.id, "n1");
		const first = byAddress(store, null, 0);
		assert.equal(first?.scope, "p:a");
		assert.equal(byAddress(store, "p:x", 9), null);
	});

	it("lists the due live rows in review order", () => {
		const store = newStore();
		addNote(store, { id: "d1", pos: 0, body: "one", review_at: T1 });
		addNote(store, { id: "d2", pos: 1, body: "two", review_at: T3 });
		addNote(store, { id: "d3", pos: 2, body: "three", review_at: null });
		addNote(store, {
			id: "d4",
			pos: 3,
			state: "hidden",
			body: "four",
			review_at: T0,
		});
		addNote(store, {
			id: "d5",
			pos: 4,
			body: "five",
			review_at: "2026-01-15T00:00:00.000Z",
		});
		const due = dueReviews(store, NOW);
		assert.deepEqual(
			due.map((note) => note.id),
			["d5", "d1"],
		);
		const capped = dueReviews(store, NOW, 1);
		assert.deepEqual(
			capped.map((note) => note.id),
			["d5"],
		);
	});

	it("counts the live rows of each scope", () => {
		const store = newStore();
		addNote(store, { id: "n1", pos: 0, scope: "p:x", body: "a" });
		addNote(store, { id: "n2", pos: 1, scope: "p:x", body: "b" });
		addNote(store, {
			id: "n3",
			pos: 2,
			scope: "p:x",
			body: "c",
			state: "hidden",
		});
		addNote(store, { id: "n4", pos: 0, scope: "p:y", body: "d" });
		assert.deepEqual(
			liveCounts(store),
			new Map<ScopeKey, number>([
				["p:x" as ScopeKey, 2],
				["p:y" as ScopeKey, 1],
			]),
		);
	});

	it("lists each row of one scope in slot order", () => {
		const store = newStore();
		addNote(store, { id: "n2", pos: 2, state: "hidden", body: "two" });
		addNote(store, { id: "n0", pos: 0, body: "zero" });
		addNote(store, { id: "n1", pos: 1, body: "one" });
		assert.deepEqual(
			scopeNotes(store, "p:x" as ScopeKey).map((note) => note.id),
			["n0", "n1", "n2"],
		);
	});

	it("lists the nodes of one scope by level and start", () => {
		const store = newStore();
		addNode(store, "p:x", 1, 2, "b");
		addNode(store, "p:x", 2, 0, "c");
		addNode(store, "p:x", 1, 0, "a");
		assert.deepEqual(
			nodesOf(store, "p:x" as ScopeKey).map((node) => [node.level, node.start]),
			[
				[1, 0],
				[1, 2],
				[2, 0],
			],
		);
	});
});
// #endregion FUNC_test_reads

// #region FUNC_test_directions
/**
 * @purpose Prove the budget choice, the newest-last line order, and the rest list.
 */
describe("directions", () => {
	it("keeps the budget newest scopes and puts the older scopes in rest", () => {
		const store = newStore();
		addNote(store, {
			id: "a",
			pos: 0,
			scope: "p:a",
			body: "a",
			ts: T0,
		});
		addNote(store, {
			id: "b",
			pos: 0,
			scope: "p:b",
			body: "b",
			ts: T2,
			modified_at: T0,
		});
		addNote(store, {
			id: "c",
			pos: 0,
			scope: "p:c",
			body: "c",
			ts: T1,
			modified_at: T0,
		});
		addNote(store, {
			id: "e",
			pos: 0,
			scope: "p:e",
			body: "e",
			state: "hidden",
			ts: T3,
		});
		addNote(store, {
			id: "f",
			pos: 1,
			scope: "p:a",
			body: "f",
			ts: "2026-01-10T00:00:00.000Z",
			modified_at: T3,
		});
		const data = directionsData(
			store,
			["p:a", "p:b", "p:c", "p:e", "p:z"].map((scope) => scope as ScopeKey),
			2,
		);
		assert.deepEqual(
			data.lines.map((line) => line.scope),
			["p:c", "p:b"],
		);
		assert.deepEqual(
			data.lines.map((line) => line.newestTs),
			[T1, T2],
		);
		assert.ok(data.lines.every((line) => line.summary === null));
		assert.deepEqual(data.rest, ["p:a"]);
	});

	it("keeps the rank of a scope when an old note moves into it", () => {
		const store = newStore();
		const old = note(store, {
			scope: "p:wrong",
			body: "a 2023 record",
			ts: T0,
			kind: "note",
			session: "s",
			turn: "t",
			preset: "p",
		});
		if (!old.ok) assert.fail(old.reason);
		note(store, {
			scope: "p:target",
			body: "an older record",
			ts: T1,
			kind: "note",
			session: "s",
			turn: "t",
			preset: "p",
		});
		note(store, {
			scope: "p:fresh",
			body: "a fresh record",
			ts: T2,
			kind: "note",
			session: "s",
			turn: "t",
			preset: "p",
		});
		amend(store, { id: old.value.id, scope: "p:target" });
		const data = directionsData(
			store,
			["p:wrong", "p:target", "p:fresh"].map((scope) => scope as ScopeKey),
			2,
		);
		assert.deepEqual(
			data.lines.map((line) => line.scope),
			["p:target", "p:fresh"],
		);
		assert.deepEqual(data.rest, []);
	});

	it("gives no line and no rest entry for an empty profile", () => {
		const store = newStore();
		addNote(store, { id: "a", pos: 0, scope: "p:a", body: "a" });
		assert.deepEqual(directionsData(store, [], 3), { lines: [], rest: [] });
	});
});
// #endregion FUNC_test_directions

// #region FUNC_test_newest_scope
describe("newest scope", () => {
	it("gives the scope of the newest live note", () => {
		const store = newStore();
		addNote(store, {
			id: "a",
			pos: 0,
			scope: "p:a",
			body: "a",
			ts: T1,
			modified_at: T3,
		});
		addNote(store, {
			id: "b",
			pos: 0,
			scope: "p:b",
			body: "b",
			ts: T3,
			modified_at: T1,
		});
		addNote(store, {
			id: "c",
			pos: 0,
			scope: "p:c",
			body: "c",
			ts: T2,
			modified_at: T0,
		});
		assert.equal(
			newestScope(
				store,
				["p:a", "p:b", "p:c"].map((key) => key as ScopeKey),
			),
			"p:b",
		);
	});

	it("ignores a scope outside the set and a scope with no live note", () => {
		const store = newStore();
		addNote(store, {
			id: "a",
			pos: 0,
			scope: "p:a",
			body: "a",
			ts: T1,
		});
		addNote(store, {
			id: "b",
			pos: 0,
			scope: "p:b",
			body: "b",
			state: "hidden",
			ts: T3,
		});
		assert.equal(newestScope(store, ["p:a"]), "p:a");
		assert.equal(newestScope(store, ["p:b"]), null);
		assert.equal(newestScope(store, []), null);
	});
});
// #endregion FUNC_test_newest_scope
