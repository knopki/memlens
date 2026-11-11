/**
 * #region moduleContract
 * @purpose Verify the pure read answers for find filters, open, review, and the scope list.
 * @scope Pure functions over a projection and hit lists. No store, no files, and no index.
 * @invariants Filters, limits, document sizes, and line forms follow the read contracts.
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import { project, scopeTree } from "../src/domain/projection.js";
import {
	dueRecords,
	FIND_DEFAULT_LIMIT,
	FIND_MAX_PER_SCOPE,
	filterHits,
	LONGFORM_ALL,
	LONGFORM_HEAD,
	openNote,
	openRange,
	scopeLines,
	upcomingRecords,
} from "../src/domain/reads.js";
import type { JsonlLine } from "../src/types/events.js";
import type { Projection } from "../src/types/projection.js";
import type { IndexHit } from "../src/types/store.js";

let counter = 0;
const note = (
	scope: string,
	body: string,
	extra: Partial<{
		ts: string;
		review_at: string | null;
		longform: string;
	}> = {},
): JsonlLine => {
	counter += 1;
	return {
		id: `000000000000000000000000${String(counter).padStart(2, "0")}`,
		at: `2026-11-10T00:00:${String(counter).padStart(2, "0")}.000Z`,
		scope: scope as `x:${string}`,
		op: "note",
		body,
		kind: "note",
		ts: extra.ts ?? "2026-11-01T00:00:00.000Z",
		review_at: extra.review_at ?? null,
		session: "s",
		turn: "t",
		preset: "p",
		...(extra.longform === undefined ? {} : { longform: extra.longform }),
	};
};

const hit = (over: Partial<IndexHit>): IndexHit => ({
	addr: `x:a#${over.pos ?? 0}`,
	scope: "x:a",
	pos: 0,
	id: `id-${over.pos ?? 0}`,
	ts: "2026-11-01T00:00:00.000Z",
	kind: "note",
	body: "body",
	longformChars: 0,
	review_at: null,
	...over,
});

describe("filterHits", () => {
	it("keeps the order, applies the default limit, and caps each scope", () => {
		const hits: IndexHit[] = [];
		for (let pos = 0; pos < 60; pos += 1)
			hits.push(hit({ pos, id: `a${pos}`, scope: "x:a" }));
		for (let pos = 0; pos < 20; pos += 1)
			hits.push(hit({ pos, id: `b${pos}`, scope: "x:b" }));
		const capped = filterHits(hits, { limit: 100 }, "2026-11-10");
		expect(capped).toHaveLength(50 + 20);
		expect(capped.filter((item) => item.scope === "x:a").length).toBe(
			FIND_MAX_PER_SCOPE,
		);
		const filtered = filterHits(hits, {}, "2026-11-10");
		expect(filtered).toHaveLength(FIND_DEFAULT_LIMIT);
		expect(filtered.every((item) => item.id.startsWith("a"))).toBe(true);
		expect(filterHits(hits, { limit: 0 }, "2026-11-10")).toEqual([]);
		expect(filterHits(hits, { limit: -5 }, "2026-11-10")).toEqual([]);
	});

	it("applies the scope, kind, date, and due filters", () => {
		const hits = [
			hit({ pos: 0, scope: "x:a", ts: "2026-11-01T12:00:00.000Z" }),
			hit({
				pos: 1,
				scope: "x:b",
				ts: "2026-11-02T12:00:00.000Z",
				kind: "fact",
			}),
			hit({
				pos: 2,
				scope: "x:a",
				ts: "2026-11-03T12:00:00.000Z",
				review_at: "2026-11-02",
			}),
		];
		expect(
			filterHits(hits, { scopes: ["x:a"] }, "2026-11-10").map(
				(item) => item.pos,
			),
		).toEqual([0, 2]);
		expect(
			filterHits(hits, { kinds: ["fact"] }, "2026-11-10").map(
				(item) => item.pos,
			),
		).toEqual([1]);
		expect(
			filterHits(hits, { since: "2026-11-02" }, "2026-11-10").map(
				(item) => item.pos,
			),
		).toEqual([1, 2]);
		expect(
			filterHits(hits, { until: "2026-11-02" }, "2026-11-10").map(
				(item) => item.pos,
			),
		).toEqual([0, 1]);
		expect(
			filterHits(hits, { due: true }, "2026-11-10").map((item) => item.pos),
		).toEqual([2]);
		expect(
			filterHits(hits, { due: true }, "2026-11-02").map((item) => item.pos),
		).toEqual([2]);
		expect(
			filterHits(hits, { due: true }, "2026-11-01").map((item) => item.pos),
		).toEqual([]);
	});
});

describe("openNote", () => {
	it("gives the head, continues at the offset, and reports the rest", async () => {
		const projection = project([
			note("x:a", "body", { longform: "д".repeat(20_000) }),
		]);
		const record = [...projection.records.values()][0];
		if (!record) throw new Error("Fixture needs a record");
		const head = openNote("x:a", record);
		expect(head.longform).toHaveLength(LONGFORM_HEAD);
		expect(head.longformChars).toBe(20_000);
		expect(head.longformOffset).toBe(LONGFORM_HEAD);
		expect(head.longformTruncated).toBe(true);
		const next = openNote("x:a", record, "head", LONGFORM_HEAD);
		expect(next.longform).toHaveLength(LONGFORM_HEAD);
		expect(next.longformOffset).toBe(2 * LONGFORM_HEAD);
		expect(next.longformTruncated).toBe(true);
		const last = openNote("x:a", record, "head", 2 * LONGFORM_HEAD);
		expect(last.longform).toHaveLength(20_000 - 2 * LONGFORM_HEAD);
		expect(last.longformTruncated).toBe(false);
		const all = openNote("x:a", record, "all");
		expect(all.longform).toHaveLength(LONGFORM_ALL);
		const none = openNote("x:a", record, "none");
		expect(none.longform).toBeUndefined();
		expect(none.longformChars).toBe(20_000);
		expect(none.longformTruncated).toBe(true);
	});
});

describe("openRange", () => {
	const notes = [
		note("x:a", "first", { ts: "2026-11-01T00:00:00.000Z" }),
		note("x:a", "second", { ts: "2026-11-02T00:00:00.000Z" }),
		note("x:a", "third", { ts: "2026-11-03T00:00:00.000Z" }),
	];
	const base = project(notes);
	const childRev = (projection: Projection, ids: readonly string[]) =>
		[...projection.records.values()]
			.filter((record) => ids.includes(record.id))
			.map((record) => record.order)
			.sort()
			.at(-1) ?? null;
	const summaryEvent = (projection: Projection): JsonlLine => ({
		id: "70000000000000000000000000",
		at: "2026-11-10T00:10:00.000Z",
		scope: "x:a",
		op: "node",
		level: 1,
		start: 0,
		child_a: notes[0]?.id ?? null,
		child_b: notes[1]?.id ?? null,
		input_rev: childRev(projection, [notes[0]?.id ?? "", notes[1]?.id ?? ""]),
		summary: "first two",
		chars: 9,
		truncated: false,
		ts_from: "2026-11-01T00:00:00.000Z",
		ts_to: "2026-11-02T00:00:00.000Z",
	});
	const built = project([...notes, summaryEvent(base)]);

	it("gives record lines for an aligned range of single positions", () => {
		const tree = scopeTree(base, "x:a");
		expect(openRange("x:a", tree, 0, 1)).toEqual({
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

	it("gives a clean summary half and a temporary half", () => {
		const tree = scopeTree(built, "x:a");
		expect(openRange("x:a", tree, 0, 3)).toEqual({
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
					text: "",
					built: false,
					chars: 0,
				},
			],
		});
		expect(openRange("x:a", scopeTree(base, "x:a"), 0, 3).children[0]).toEqual({
			addr: "x:a#0-1",
			ts_from: "2026-11-01T00:00:00.000Z",
			ts_to: "2026-11-02T00:00:00.000Z",
			text: "",
			built: false,
			chars: 0,
		});
	});

	it("gives one line for a range without node geometry and none for an empty range", () => {
		const tree = scopeTree(base, "x:a");
		expect(openRange("x:a", tree, 1, 2).children).toEqual([
			{
				addr: "x:a#1",
				ts_from: "2026-11-02T00:00:00.000Z",
				ts_to: "2026-11-03T00:00:00.000Z",
				text: "",
				built: false,
				chars: 0,
			},
		]);
		expect(openRange("x:a", tree, 8, 9).children).toEqual([]);
	});
});

describe("dueRecords and scopeLines", () => {
	const projection = project([
		note("x:a", "old decision", { review_at: "2026-01-01" }),
		note("x:a", "fresh task", { review_at: "2026-12-01" }),
		note("x:b", "due fact", {
			review_at: "2026-11-10",
			ts: "2026-11-05T00:00:00.000Z",
		}),
		note("x:c", "no review"),
		note("x:a", "later decision", { review_at: "2026-12-15" }),
	]);

	it("lists the due records of each visible scope in date order", () => {
		expect(
			dueRecords(projection, null, "2026-11-10").map((item) => item.body),
		).toEqual(["old decision", "due fact"]);
		expect(dueRecords(projection, ["x:b"], "2026-11-10")).toEqual([
			{
				addr: "x:b#0",
				scope: "x:b",
				pos: 0,
				ts: "2026-11-05T00:00:00.000Z",
				kind: "note",
				body: "due fact",
				review_at: "2026-11-10",
			},
		]);
		expect(dueRecords(projection, null, "2025-12-31")).toEqual([]);
	});

	it("lists the upcoming records in date order under the limit", () => {
		expect(
			upcomingRecords(projection, null, "2026-11-10", 10).map(
				(item) => item.body,
			),
		).toEqual(["fresh task", "later decision"]);
		expect(
			upcomingRecords(projection, null, "2026-11-10", 1).map(
				(item) => item.body,
			),
		).toEqual(["fresh task"]);
		expect(upcomingRecords(projection, null, "2026-12-31", 10)).toEqual([]);
	});

	it("compares an older date value with a full review time", () => {
		const mixed = project([
			note("x:a", "date due", { review_at: "2026-11-10" }),
			note("x:a", "time due", { review_at: "2026-11-10T09:00:00.000Z" }),
		]);
		expect(
			dueRecords(mixed, null, "2026-11-10T12:00:00.000Z").map(
				(item) => item.body,
			),
		).toEqual(["date due", "time due"]);
		expect(
			upcomingRecords(mixed, null, "2026-11-10T08:00:00.000Z", 10).map(
				(item) => item.body,
			),
		).toEqual(["time due"]);
	});

	it("lists each scope with its live count and its last write date", () => {
		expect(scopeLines(projection, null)).toEqual([
			{ key: "x:a", notes: 3, lastSeen: "2026-11-10" },
			{ key: "x:b", notes: 1, lastSeen: "2026-11-10" },
			{ key: "x:c", notes: 1, lastSeen: "2026-11-10" },
		]);
		expect(scopeLines(projection, ["x:c"]).map((line) => line.key)).toEqual([
			"x:c",
		]);
	});
});
