/**
 * #region moduleContract
 * @purpose Check the context template, the line forms, the ages, the budgets, and the epoch.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import {
	CONTEXT_TEMPLATE,
	type DirectionScope,
	directionLines,
	epoch,
	hereLines,
	POLICY,
	renderContext,
} from "../src/domain/context.js";
import type { ScopeKey } from "../src/types/events.js";
import type { Tree, TreeNode, TreeRecord } from "../src/types/tree.js";

const record = (
	pos: number,
	state: TreeRecord["state"] = "live",
): TreeRecord => ({
	id: `r${pos}`,
	order: `100|r${pos}`,
	pos,
	state,
	body: `body ${pos}`,
	longform: null,
	at: `2026-11-${pos + 1}`,
	ts: `2026-11-${pos + 1}`,
});
const node = (
	start: number,
	level: number,
	summary: string,
	id = `n${start}:${level}`,
): TreeNode => ({
	id,
	order: `200|${id}`,
	range: { start, level },
	child_a: `r${start}`,
	child_b: `r${start + 2 ** (level - 1)}`,
	input_rev: `100|r${start + 2 ** level - 1}`,
	summary,
	chars: summary.length,
	truncated: false,
	ts_from: `2026-11-${start + 1}`,
	ts_to: `2026-11-${start + 2 ** level}`,
});
const scopeTree = (count: number, nodes: TreeNode[] = []): Tree => ({
	total: count,
	notes: Array.from({ length: count }, (_, pos) => record(pos)),
	nodes,
	invalidated: [],
});
const catalog = (roots: readonly Tree[]): Tree => ({
	total: roots.length,
	notes: [],
	scope_roots: new Map(roots.map((root, pos) => [pos, root])),
	nodes: [],
	invalidated: [],
});
const scope = (
	key: string,
	live: number,
	lastWrite: string,
): DirectionScope => ({
	key,
	live,
	lastWrite,
});
const now = "2026-11-10T18:00:00.000Z";

describe("hereLines", () => {
	it("renders each leaf with its date and body", () => {
		expect(hereLines(scopeTree(2), 4)).toBe(
			"#0 2026-11-1 body 0\n#1 2026-11-2 body 1",
		);
	});

	it("keeps the date of the period and drops the time of day", () => {
		const timed: Tree = {
			total: 3,
			notes: Array.from({ length: 3 }, (_, pos) => ({
				...record(pos),
				ts: `2026-11-0${pos + 1}T08:38:36.760Z`,
			})),
			nodes: [
				{
					...node(0, 1, "first pair"),
					ts_from: "2026-11-01T08:38:36.760Z",
					ts_to: "2026-11-02T09:00:00.000Z",
				},
			],
			invalidated: [],
		};
		expect(hereLines(timed, 2)).toBe(
			"#0-1 2026-11-01..2026-11-02 first pair\n#2 2026-11-03 body 2",
		);
	});

	it("renders a clean node with its period and summary", () => {
		const tree = scopeTree(3, [node(0, 1, "first pair")]);
		expect(hereLines(tree, 2)).toBe(
			"#0-1 2026-11-1..2026-11-2 first pair\n#2 2026-11-3 body 2",
		);
	});

	it("renders a missing node as a temporary line with the assembled text", () => {
		expect(hereLines(scopeTree(3), 2)).toBe(
			"#0-1 2026-11-1..2026-11-2 body 0; body 1\n#2 2026-11-3 body 2",
		);
	});
});

describe("directionLines", () => {
	it("gives a range of scopes the range of their idle times", () => {
		const tree = catalog([
			scopeTree(2, [node(0, 1, "scope a summary")]),
			scopeTree(2),
		]);
		const lines = directionLines(
			tree,
			[
				scope("project:a", 2, "2026-11-10T12:00:00.000Z"),
				scope("global:prefs", 2, "2026-11-07T12:00:00.000Z"),
			],
			4,
			now,
		);
		expect(lines).toBe(
			"[project:a] 6h scope a summary\n[global:prefs] 3d body 0; body 1",
		);
	});

	it("joins the keys and the counts of a merged catalog line", () => {
		const ready = scopeTree(2, [node(0, 1, "root summary")]);
		const folded = {
			...catalog([ready, ready, scopeTree(2)]),
			nodes: [
				{
					...node(0, 1, "both scopes"),
					child_a: "n0:1",
					child_b: "n0:1",
					input_rev: "200|n0:1",
				},
			],
		};
		const lines = directionLines(
			folded,
			[
				scope("project:a", 2, "2026-11-10T17:30:00.000Z"),
				scope("global:prefs", 2, "2026-11-07T12:00:00.000Z"),
				scope("project:c", 2, "2026-11-10T17:45:00.000Z"),
			],
			2,
			now,
		);
		expect(lines).toBe(
			"[project:a,global:prefs] 30m..3d both scopes\n[project:c] 15m body 0; body 1",
		);
	});

	it("gives no line for a scope with no live note", () => {
		const hidden: Tree = {
			total: 1,
			notes: [record(0, "hidden")],
			nodes: [],
			invalidated: [],
		};
		const tree = catalog([
			scopeTree(2, [node(0, 1, "scope a summary")]),
			hidden,
		]);
		expect(
			directionLines(
				tree,
				[scope("project:a", 2, "2026-11-10T12:00:00.000Z")],
				4,
				now,
			),
		).toBe("[project:a] 6h scope a summary");
	});
});

describe("renderContext", () => {
	const input = {
		scope: "project:a" as ScopeKey,
		here: scopeTree(2),
		hereBudget: 4,
		catalog: catalog([scopeTree(2, [node(0, 1, "root summary")])]),
		catalogScopes: [scope("project:a", 2, "2026-11-10T12:00:00.000Z")],
		directionsBudget: 4,
		now,
	};

	it("fills the template with the policy, the guide lines, and both parts", () => {
		const text = renderContext(input);
		expect(text).toContain("<memory>\n<how-to>\n");
		expect(text).toContain(POLICY);
		expect(text).toContain(
			"One line for each range of scopes: the keys, the age, and the summary.",
		);
		expect(text).toContain("[project:a] 6h root summary");
		expect(text).toContain('<here scope="project:a">');
		expect(text).toContain("#0 2026-11-1 body 0");
		expect(text).not.toContain("{{");
		expect(text).not.toContain("__catalog__");
		expect(text).not.toContain("review_at");
	});

	it("gives the same text for the same inputs", () => {
		expect(renderContext(input)).toBe(renderContext(input));
	});

	it("replaces the whole template with customPrompt and keeps the placeholders", () => {
		const text = renderContext({
			...input,
			customPrompt: "P {{policy}}|{{scope}}|{{directions}}|{{here}}|{{append}}",
		});
		expect(text.startsWith(`P ${POLICY}|project:a|`)).toBe(true);
		expect(text.endsWith("|")).toBe(true);
	});

	it("fills the append placeholder with customPromptAppend before the append value", () => {
		expect(
			renderContext({ ...input, customPromptAppend: "extra rules" }),
		).toContain("\nextra rules\n</how-to>");
		expect(renderContext({ ...input, append: "plain append" })).toContain(
			"\nplain append\n</how-to>",
		);
	});

	it("keeps the CONTEXT_TEMPLATE a copy of the product text", () => {
		expect(CONTEXT_TEMPLATE).toContain("<how-to>\n{{policy}}\n{{append}}");
		expect(CONTEXT_TEMPLATE).toContain("{{directions}}\n</directions>");
		expect(CONTEXT_TEMPLATE).toContain('<here scope="{{scope}}">');
	});
});

describe("epoch", () => {
	it("changes with one node and ignores the node order", () => {
		const first = node(0, 1, "a");
		const second = node(2, 1, "b");
		const base = epoch("1", [first, second]);
		expect(epoch("1", [second, first])).toBe(base);
		expect(epoch("1", [first, second])).not.toBe(epoch("2", [first, second]));
		expect(epoch("1", [first, node(2, 1, "c", "n2:1c")])).not.toBe(base);
	});
});
