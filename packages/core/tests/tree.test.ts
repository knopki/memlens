/**
 * #region moduleContract
 * @purpose Check tree freshness, copied inputs, the minimal slice fold, and the pure frontier.
 * @scope The projection tree of the frontend branch and the fold over a sorted position list.
 * @invariants The fold over a position list equals the fold over the tree of the same positions.
 * @keywords test, tree, fold, frontier, position, slice
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import {
	buildInput,
	candidates,
	catalogChildren,
	currentNode,
	due,
	fold,
	foldPositions,
	inputUnchanged,
	isBuilt,
	isClean,
	LINE_LIMIT,
	rev,
	slice,
	topRange,
	topRangeOf,
} from "../src/domain/tree.js";
import type {
	Order,
	Pos,
	Range,
	Tree,
	TreeNode,
	TreeRecord,
} from "../src/types/tree.js";

function required<T>(value: T | null | undefined): T {
	if (value === null || value === undefined)
		throw new Error("Fixture value is absent");
	return value;
}

const range = (start: number, level: number): Range => ({ start, level });
const record = (
	pos: number,
	state: TreeRecord["state"] = "live",
): TreeRecord => ({
	id: `r${pos}`,
	pos,
	order: `100|r${pos}`,
	state,
	body: `body ${pos}`,
	longform: null,
	at: `at ${pos}`,
	ts: `date ${pos}`,
});
const tree = (count: number): Tree => ({
	total: count,
	notes: Array.from({ length: count }, (_, pos) => record(pos)),
	nodes: [],
	invalidated: [],
});
function node(
	tree: Tree,
	start: number,
	level: number,
	id = `n${start}:${level}`,
): TreeNode {
	const address = range(start, level);
	const input = buildInput(tree, address);
	if (!input) throw new Error("Fixture needs ready children");
	const half = 2 ** (level - 1);
	const revisions = [
		rev(tree, range(start, level - 1)),
		rev(tree, range(start + half, level - 1)),
	];
	const input_rev =
		revisions
			.filter((value): value is Order => value !== null)
			.sort()
			.at(-1) ?? null;
	return {
		id,
		order: `200|${level}|${id}`,
		range: address,
		child_a: input.children[0]?.id ?? null,
		child_b: input.children[1]?.id ?? null,
		input_rev,
		summary: `summary ${start}:${level}`,
		chars: 10,
		truncated: false,
		ts_from: `date ${start}`,
		ts_to: `date ${Math.min(tree.total, start + 2 ** level) - 1}`,
	};
}
function built(count: number): Tree {
	let result = tree(count);
	const root = topRange(result);
	for (let level = 1; level <= (root?.level ?? 0); level += 1) {
		for (let start = 0; start < count; start += 2 ** level) {
			result = {
				...result,
				nodes: [...result.nodes, node(result, start, level)],
			};
		}
	}
	return result;
}

// #region FUNC_referenceFold
/** @purpose Compare the sparse fold with the exact dense demo pair rules. */
function referenceFold(input: Tree, budget: number): Range[] {
	const live = (r: Range) =>
		input.notes.some(
			(n) =>
				n.state === "live" &&
				n.pos >= r.start &&
				n.pos < r.start + 2 ** r.level,
		);
	const highest = Math.max(
		...input.notes.filter((n) => n.state === "live").map((n) => n.pos),
	);
	const blocks = Array.from({ length: input.total }, (_, pos) => range(pos, 0));
	while (blocks.filter(live).length > budget) {
		const options: { index: number; range: Range; jump: number }[] = [];
		for (let i = 0; i + 1 < blocks.length; i += 1) {
			const left = blocks[i];
			const right = blocks[i + 1];
			if (!left || !right || left.level !== right.level) continue;
			const parent = range(left.start, left.level + 1);
			const end = parent.start + 2 ** parent.level;
			if (
				right.start !== left.start + 2 ** left.level ||
				left.start % 2 ** parent.level ||
				end > input.total ||
				(highest >= left.start && highest < end)
			)
				continue;
			const jump = [blocks[i - 1], blocks[i + 2]].reduce(
				(sum, n) => sum + (n ? Math.max(0, parent.level - 1 - n.level) : 0),
				0,
			);
			options.push({ index: i, range: parent, jump });
		}
		options.sort(
			(a, b) =>
				a.jump - b.jump ||
				due(input.total, range(b.range.start, b.range.level - 1)) -
					due(input.total, range(a.range.start, a.range.level - 1)) ||
				a.range.level - b.range.level ||
				a.range.start - b.range.start,
		);
		const best = options[0];
		if (!best) break;
		blocks.splice(best.index, 2, best.range);
	}
	const visible = blocks.filter(live);
	return visible.slice(Math.max(0, visible.length - Math.max(1, budget)));
}
// #endregion FUNC_referenceFold

describe("tree geometry and freshness", () => {
	it("keeps assigned extent and uses the child-level due formula", () => {
		expect(topRange(tree(0))).toBeNull();
		expect(topRange(tree(1))).toEqual(range(0, 1));
		expect(topRange(tree(5))).toEqual(range(0, 3));
		expect(due(100, range(0, 2))).toBe(23.25);
		expect(due(100, range(8, 2))).toBe(21.25);
	});

	it("checks built, clean, exact child positions and revisions", () => {
		const input = built(5);
		const root = required(currentNode(input, range(0, 3)));
		expect(root).not.toBeNull();
		expect(isBuilt(input, root)).toBe(true);
		expect(isClean(input, root)).toBe(true);
		expect(candidates(input)).toEqual([]);
		expect(
			isBuilt(input, {
				...root,
				child_a: root.child_b,
				child_b: root.child_a,
			}),
		).toBe(false);
		expect(isClean(input, { ...root, input_rev: "wrong|revision" })).toBe(
			false,
		);
		const pair = required(currentNode(input, range(0, 1)));
		expect(isBuilt(input, { ...pair, child_a: "r1", child_b: "r0" })).toBe(
			false,
		);
		expect(isBuilt(input, { ...pair, child_a: null })).toBe(false);
	});

	it("keeps a built parent dirty when a child revision changes", () => {
		const input = built(4);
		const pair = required(currentNode(input, range(0, 1)));
		const parent = required(currentNode(input, range(0, 2)));
		const dirty: Tree = {
			...input,
			nodes: input.nodes.map((n) =>
				n.id === pair.id ? { ...n, input_rev: "stale|revision" } : n,
			),
		};
		expect(isBuilt(dirty, parent)).toBe(true);
		expect(isClean(dirty, parent)).toBe(false);
		expect(buildInput(dirty, parent.range)).toBeNull();
		expect(candidates(dirty)).toEqual([pair.range, parent.range]);
	});

	it("rejects invalidated text when an older imported amend leaves the maximum unchanged", () => {
		const input = built(4);
		const pair = required(currentNode(input, range(0, 1)));
		const parent = required(currentNode(input, range(0, 2)));
		const changed: Tree = {
			...input,
			notes: input.notes.map((n) =>
				n.pos === 0
					? { ...n, body: "old imported amend", order: "050|import" }
					: n,
			),
			invalidated: [pair.id, parent.id],
		};
		expect(rev(changed, range(0, 0))).toBe("050|import");
		expect(currentNode(changed, pair.range)).toBeNull();
		expect(isClean(changed, pair)).toBe(false);
		expect(slice(changed, 3)[0]).toEqual({
			kind: "temporary",
			range: pair.range,
			from: "date 0",
			to: "date 1",
			text: "old imported amend; body 1",
		});
	});

	it("accepts only empty null halves, including padding", () => {
		const input = built(1);
		const root = required(currentNode(input, range(0, 1)));
		expect(root.child_b).toBeNull();
		expect(isClean(input, root)).toBe(true);
		const hidden = { ...input, notes: [record(0, "hidden")] };
		expect(rev(hidden, root.range)).toBeNull();
		expect(isBuilt(hidden, { ...root, child_a: null })).toBe(false);
		expect(buildInput(hidden, root.range)).toBeNull();
		expect(candidates(hidden)).toEqual([]);
		expect(slice(hidden, 2)).toEqual([]);
	});

	it("selects the latest non-invalidated candidate and rejects stale descendants", () => {
		const input = built(4);
		const pair = required(currentNode(input, range(0, 1)));
		const newer: TreeNode = { ...pair, id: "new", order: "999|new" };
		const withNew = { ...input, nodes: [...input.nodes, newer] };
		expect(currentNode(withNew, pair.range)).toBe(newer);
		expect(rev(withNew, range(0, 2))).toBe(newer.order);
		expect(isBuilt(withNew, required(currentNode(input, range(0, 2))))).toBe(
			false,
		);
		expect(
			currentNode({ ...withNew, invalidated: [newer.id] }, pair.range),
		).toBe(pair);
		const invalidated = { ...input, invalidated: [pair.id] };
		expect(isClean(invalidated, pair)).toBe(false);
		expect(buildInput(invalidated, range(0, 2))).toBeNull();
		expect(candidates(invalidated)).toContainEqual(pair.range);
	});
});

describe("build snapshots", () => {
	it("copies records, preview limits and ranges without mutable references", () => {
		const first = { ...record(0), longform: "x".repeat(1100) };
		const input = { ...tree(2), notes: [first, record(1)] };
		const address = range(0, 1);
		const snapshot = required(buildInput(input, address));
		expect(snapshot.range).not.toBe(address);
		expect(snapshot.children[0]).toEqual({
			kind: "record",
			id: "r0",
			pos: 0,
			body: "body 0",
			preview: "x".repeat(1024),
			ts: "date 0",
		});
		expect(snapshot.children[1]).toMatchObject({ preview: "" });
		expect(inputUnchanged(input, snapshot)).toBe(true);
		first.body = "changed";
		expect(snapshot.children[0]).toMatchObject({ body: "body 0" });
		expect(inputUnchanged(input, snapshot)).toBe(false);
	});

	it("compares semantic fields independent of property insertion order", () => {
		const input = built(4);
		const snapshot = required(buildInput(input, range(0, 2)));
		const first = required(snapshot.children[0]);
		expect(first.kind).toBe("node");
		if (first.kind !== "node") throw new Error("Expected node child");
		expect(first.range).not.toBe(
			required(currentNode(input, range(0, 1))).range,
		);
		expect(
			inputUnchanged(input, {
				children: [
					{ ...first, range: { level: 1, start: 0 } },
					snapshot.children[1],
				],
				range: { level: 2, start: 0 },
			}),
		).toBe(true);
		const changed: Tree = {
			...input,
			nodes: input.nodes.map((n) =>
				n.id === first.id ? { ...n, summary: "changed" } : n,
			),
		};
		expect(inputUnchanged(changed, snapshot)).toBe(false);
		for (const field of ["ts_from", "ts_to"] as const) {
			const changedDate = {
				...input,
				nodes: input.nodes.map((n) =>
					n.id === first.id ? { ...n, [field]: "changed date" } : n,
				),
			};
			expect(inputUnchanged(changedDate, snapshot)).toBe(false);
			expect(buildInput(changedDate, range(0, 2))?.children[0]).toMatchObject({
				[field]: "changed date",
			});
		}
	});

	it("rejects live state changes, including null-to-live and dirty children", () => {
		const input = { ...tree(2), notes: [record(0, "hidden"), record(1)] };
		const snapshot = required(buildInput(input, range(0, 1)));
		expect(snapshot.children[0]).toBeNull();
		expect(
			inputUnchanged({ ...input, notes: [record(0), record(1)] }, snapshot),
		).toBe(false);
		expect(
			inputUnchanged(
				{ ...input, notes: [record(0, "hidden"), record(1, "deleted")] },
				snapshot,
			),
		).toBe(false);
		const ready = built(4);
		const parentInput = required(buildInput(ready, range(0, 2)));
		expect(
			inputUnchanged(
				{ ...ready, invalidated: [required(parentInput.children[0]).id] },
				parentInput,
			),
		).toBe(false);
		expect(
			inputUnchanged(
				{
					...ready,
					nodes: [
						...ready.nodes,
						{
							...required(currentNode(ready, range(0, 2))),
							id: "another",
							order: "999|another",
						},
					],
				},
				parentInput,
			),
		).toBe(true);
	});
});

describe("catalogs", () => {
	it("uses scope roots at catalog positions and retains their own ranges", () => {
		const first = built(5);
		const last = built(1);
		const catalog: Tree = {
			total: 2,
			notes: [],
			nodes: [],
			invalidated: [],
			scope_roots: new Map([
				[0, first],
				[1, last],
			]),
		};
		const snapshot = required(buildInput(catalog, range(0, 1)));
		expect(snapshot.children[0]).toMatchObject({
			kind: "node",
			range: range(0, 3),
		});
		expect(snapshot.children[1]).toMatchObject({
			kind: "node",
			range: range(0, 1),
		});
		const parent = node(catalog, 0, 1);
		expect(isClean(catalog, parent)).toBe(true);
		expect(
			isBuilt(catalog, {
				...parent,
				child_a: parent.child_b,
				child_b: parent.child_a,
			}),
		).toBe(false);
		expect(slice(catalog, 1)).toEqual([
			{
				kind: "summary",
				range: range(1, 0),
				from: "date 0",
				to: "date 0",
				summary: "summary 0:1",
			},
		]);
	});

	it("distinguishes an empty scope from a non-empty scope without a ready root", () => {
		const empty = { ...tree(1), notes: [record(0, "deleted")] };
		const waiting = tree(1);
		const catalog: Tree = {
			total: 3,
			notes: [],
			nodes: [],
			invalidated: [],
			scope_roots: new Map([
				[0, empty],
				[2, waiting],
			]),
		};
		expect(buildInput(catalog, range(2, 1))).toBeNull();
		expect(candidates(catalog)).toEqual([range(2, 1), range(0, 2)]);
		expect(slice(catalog, 1)).toEqual([
			{
				kind: "temporary",
				range: range(2, 0),
				from: "date 0",
				to: "date 0",
				text: "body 0",
			},
		]);
	});

	it("gives the two lines below one catalog range and no line below a leaf", () => {
		const catalog: Tree = {
			total: 2,
			notes: [],
			nodes: [],
			invalidated: [],
			scope_roots: new Map([
				[0, built(1)],
				[1, tree(1)],
			]),
		};
		expect(catalogChildren(catalog, range(0, 1))).toEqual([
			{
				kind: "summary",
				range: range(0, 0),
				from: "date 0",
				to: "date 0",
				summary: "summary 0:1",
			},
			{
				kind: "temporary",
				range: range(1, 0),
				from: "date 0",
				to: "date 0",
				text: "body 0",
			},
		]);
		expect(catalogChildren(catalog, range(0, 0))).toEqual([]);
	});
});

describe("minimal fold", () => {
	it("stops at the budget and preserves the last live record", () => {
		const input = built(8);
		expect(slice(input, 8)).toHaveLength(8);
		expect(fold(input, 7)).toEqual([
			range(0, 1),
			...Array.from({ length: 6 }, (_, i) => range(i + 2, 0)),
		]);
		for (const budget of [0, 1, 2, 3, 6, 7]) {
			const lines = slice(input, budget);
			expect(lines.length).toBeLessThanOrEqual(Math.max(1, budget));
			expect(lines.at(-1)).toMatchObject({ kind: "record", pos: 7 });
		}
	});

	it("renders dirty ranges with dates and the assembled text; hidden tails keep the last live leaf", () => {
		const input = {
			...tree(8),
			notes: tree(8).notes.map((n) => (n.pos === 7 ? record(7, "hidden") : n)),
		};
		const lines = slice(input, 4);
		expect(lines[0]).toEqual({
			kind: "temporary",
			range: range(0, 1),
			from: "date 0",
			to: "date 1",
			text: "body 0; body 1",
		});
		expect(lines.at(-1)).toMatchObject({ kind: "record", pos: 6 });
		expect(lines.every((line) => line.from !== "" && line.to !== "")).toBe(
			true,
		);
	});

	it("splits the line limit between the two halves in proportion to their lengths", () => {
		const pair = (first: string, second: string): Tree => ({
			total: 4,
			notes: [
				{ ...record(0), body: first },
				{ ...record(1), body: second },
				record(2),
				record(3),
			],
			nodes: [],
			invalidated: [],
		});
		const equal = slice(pair("a".repeat(600), "b".repeat(600)), 3)[0];
		expect(equal?.kind).toBe("temporary");
		const equalText = equal?.kind === "temporary" ? equal.text : "";
		expect(equalText.length).toBeLessThanOrEqual(LINE_LIMIT);
		const [left, right] = equalText.split("; ");
		expect(Math.abs((left?.length ?? 0) - (right?.length ?? 0))).toBeLessThan(
			3,
		);
		const uneven = slice(pair("a".repeat(600), "b".repeat(40)), 3)[0];
		const unevenText = uneven?.kind === "temporary" ? uneven.text : "";
		expect(unevenText.length).toBeLessThanOrEqual(LINE_LIMIT);
		expect(unevenText.endsWith(`; ${"b".repeat(40)}`)).toBe(true);
	});

	it("matches demo jump and due ordering for dense and sparse small scopes", () => {
		for (let mask = 1; mask < 256; mask += 1) {
			const input = {
				...tree(8),
				notes: tree(8).notes.map((n) => ({
					...n,
					state: mask & (2 ** n.pos) ? ("live" as const) : ("hidden" as const),
				})),
			};
			for (let budget = 1; budget <= 8; budget += 1) {
				expect(fold(input, budget), `mask=${mask}, budget=${budget}`).toEqual(
					referenceFold(input, budget),
				);
			}
		}
		for (const count of [11, 16, 23, 60]) {
			for (let budget = 1; budget <= 20; budget += 1) {
				expect(fold(tree(count), budget)).toEqual(
					referenceFold(tree(count), budget),
				);
				for (let seed = 1; seed <= 12; seed += 1) {
					const sparse = {
						...tree(count),
						notes: tree(count).notes.map((n) => ({
							...n,
							state:
								(n.pos * 13 + seed * 7) % 17 < 5
									? ("live" as const)
									: ("hidden" as const),
						})),
					};
					expect(
						fold(sparse, budget),
						`count=${count}, seed=${seed}, budget=${budget}`,
					).toEqual(referenceFold(sparse, budget));
				}
			}
		}
	});

	it("handles sparse positions beyond 32-bit arithmetic without a dense scan", () => {
		const high = 2 ** 40 - 1;
		const input: Tree = {
			total: high + 1,
			notes: [record(high)],
			nodes: [],
			invalidated: [],
		};
		expect(topRange(input)).toEqual(range(0, 40));
		expect(candidates(input)).toHaveLength(40);
		expect(buildInput(input, range(high - 1, 1))?.children[0]).toBeNull();
		expect(slice(input, 1)).toEqual([
			{
				kind: "record",
				pos: high,
				from: `date ${high}`,
				to: `date ${high}`,
				body: `body ${high}`,
			},
		]);
	});
});

describe("pure frontier", () => {
	// #region FUNC_referenceFrontier
	/** @purpose Compare the pure fold with the fold over the projection tree of the same positions. */
	function referenceFrontier(
		positions: readonly Pos[],
		total: Pos,
		budget: number,
	): Range[] {
		const input: Tree = {
			total,
			notes: positions.map((pos) => record(pos)),
			nodes: [],
			invalidated: [],
		};
		return [...fold(input, budget)];
	}
	// #endregion FUNC_referenceFrontier

	it("keeps the top range of the assigned extent", () => {
		expect(topRangeOf(0)).toBeNull();
		expect(topRangeOf(1)).toEqual(range(0, 1));
		expect(topRangeOf(5)).toEqual(range(0, 3));
		expect(topRangeOf(2 ** 40)).toEqual(range(0, 40));
	});

	it("gives no range for an empty position list", () => {
		expect(foldPositions([], 0, 3)).toEqual([]);
		expect(foldPositions([], 8, 3)).toEqual([]);
	});

	it("folds a sorted position list like the tree of the same positions", () => {
		for (const count of [1, 2, 3, 5, 8, 11, 23]) {
			for (const budget of [0, 1, 2, 3, 5, 8]) {
				const positions = Array.from({ length: count }, (_, pos) => pos);
				expect(
					foldPositions(positions, count, budget),
					`count=${count}`,
				).toEqual(referenceFrontier(positions, count, budget));
			}
		}
	});

	it("keeps the greatest live slot at a budget of zero", () => {
		const positions = [0, 1, 2, 3, 7];
		expect(foldPositions(positions, 8, 0)).toEqual([range(7, 0)]);
		expect(foldPositions(positions, 8, 1)).toEqual([range(7, 0)]);
		expect(foldPositions(positions, 8, 2)).toEqual([range(0, 2), range(7, 0)]);
	});

	it("skips empty gaps without a dense scan", () => {
		const high = 2 ** 40 - 1;
		expect(foldPositions([high], high + 1, 1)).toEqual([range(high, 0)]);
	});
});
