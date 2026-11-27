/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the context template, the line forms, the ages, and the budgets.
 * @scope The store branch over row views, the directions order, and the projection branch.
 * @invariants The fixtures write rows by raw SQL. The directions follow the store order of the scopes.
 * @keywords test, context, here, directions, budget, template
 * #endregion moduleContract
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	CONTEXT_TEMPLATE,
	directionLines,
	hereLines,
	POLICY,
	renderContext,
} from "../src/domain/context.js";
import { dayOf } from "../src/domain/day.js";
import { Store } from "../src/store/store.js";
import type { Node } from "../src/store/types.js";
import { loadView, sliceOf, type View } from "../src/store/view.js";
import type { ScopeKey } from "../src/types/primitives.js";

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function newStore(): Store {
	const dir = mkdtempSync(join(tmpdir(), "memlens-context-"));
	dirs.push(dir);
	return new Store(dir);
}

/** One note row of a test fixture. */
interface Row {
	readonly scope?: string;
	readonly pos: number;
	readonly body: string;
	readonly state?: "live" | "hidden" | "deleted";
	readonly ts?: string;
}

const INSERT_NOTE = `INSERT INTO notes
	(id, scope, pos, state, kind, body, longform, refs, ts, created_at, modified_at, review_at, v, v_content)
	VALUES (?, ?, ?, ?, 'note', ?, NULL, '[]', ?, ?, ?, NULL, ?, ?)`;

function addNote(store: Store, row: Row): void {
	const scope = row.scope ?? "project:a";
	const ts = row.ts ?? `2026-11-${String(row.pos + 1).padStart(2, "0")}`;
	const version = `v-${scope}-${row.pos}`;
	store
		.handle()
		.prepare(INSERT_NOTE)
		.run(
			`id-${scope}-${row.pos}`,
			scope,
			row.pos,
			row.state ?? "live",
			row.body,
			ts,
			ts,
			ts,
			version,
			version,
		);
}

function addNode(
	store: Store,
	node: Pick<Node, "level" | "start" | "summary" | "a_key" | "b_key"> & {
		readonly scope?: string;
		readonly ts_from?: string;
		readonly ts_to?: string;
	},
): void {
	store
		.handle()
		.prepare(
			`INSERT INTO nodes (scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			node.scope ?? "project:a",
			node.level,
			node.start,
			node.summary,
			node.ts_from ?? "2026-11-01",
			node.ts_to ?? "2026-11-02",
			`build-${node.level}-${node.start}`,
			node.a_key,
			node.b_key,
		);
}

const leafKey = (scope: string, pos: number): string =>
	`v-${scope}-${pos}|live`;

const viewOf = (store: Store, scope = "project:a"): View =>
	loadView(store.handle(), scope as ScopeKey);

function addLive(store: Store, count: number, scope = "project:a"): void {
	for (let pos = 0; pos < count; pos += 1)
		addNote(store, { scope, pos, body: `body ${pos}` });
}

const now = "2026-11-10T18:00:00.000Z";

describe("hereLines", () => {
	it("renders each leaf with its date and body", () => {
		const store = newStore();
		addLive(store, 2);
		expect(hereLines(viewOf(store), 4)).toBe(
			"#0 2026-11-01 body 0\n#1 2026-11-02 body 1",
		);
	});

	it("shows the day of the time in the zone of the process", () => {
		const store = newStore();
		// 00:00 on 2025-05-03 in Moscow is 21:00 on 2025-05-02 in UTC.
		const ts = "2025-05-02T21:00:00.000Z";
		addNote(store, { pos: 0, body: "body 0", ts });
		expect(hereLines(viewOf(store), 4)).toBe(`#0 ${dayOf(ts)} body 0`);
	});

	it("keeps the date of the period and drops the time of day", () => {
		const store = newStore();
		addNote(store, { pos: 0, body: "body 0", ts: "2026-11-01T12:38:36.760Z" });
		addNote(store, { pos: 1, body: "body 1", ts: "2026-11-02T12:00:00.000Z" });
		addNote(store, { pos: 2, body: "body 2", ts: "2026-11-03T12:38:36.760Z" });
		addNode(store, {
			level: 1,
			start: 0,
			summary: "first pair",
			a_key: leafKey("project:a", 0),
			b_key: leafKey("project:a", 1),
			ts_from: "2026-11-01T12:38:36.760Z",
			ts_to: "2026-11-02T12:00:00.000Z",
		});
		expect(hereLines(viewOf(store), 2)).toBe(
			"#0-1 2026-11-01..02 first pair\n#2 2026-11-03 body 2",
		);
	});

	it("renders a valid node with its period and summary", () => {
		const store = newStore();
		addLive(store, 3);
		addNode(store, {
			level: 1,
			start: 0,
			summary: "first pair",
			a_key: leafKey("project:a", 0),
			b_key: leafKey("project:a", 1),
			ts_from: "2026-11-01",
			ts_to: "2026-11-02",
		});
		expect(hereLines(viewOf(store), 2)).toBe(
			"#0-1 2026-11-01..02 first pair\n#2 2026-11-03 body 2",
		);
	});

	it("renders a missing node as a temporary line with the assembled text", () => {
		const store = newStore();
		addLive(store, 3);
		expect(hereLines(viewOf(store), 2)).toBe(
			"#0-1 2026-11-01..02 body 0; body 1\n#2 2026-11-03 body 2",
		);
	});

	it("limits the array lines to the budget and keeps the view budget floor", () => {
		const store = newStore();
		addLive(store, 3);
		const view = viewOf(store);
		const lines = sliceOf(view, 3);
		expect(hereLines(lines, 2)).toBe(
			"#0 2026-11-01 body 0\n#1 2026-11-02 body 1",
		);
		expect(hereLines(lines, 0)).toBe("");
		expect(hereLines(view, 0)).toBe("#2 2026-11-03 body 2");
	});

	it("renders a hidden note as no half and keeps no stale summary", () => {
		const store = newStore();
		addLive(store, 3);
		addNode(store, {
			level: 1,
			start: 0,
			summary: "stale pair",
			a_key: leafKey("project:a", 0),
			b_key: leafKey("project:a", 1),
		});
		store
			.handle()
			.prepare("UPDATE notes SET state = 'hidden' WHERE pos = 0")
			.run();
		expect(hereLines(viewOf(store), 2)).toBe(
			"#1 2026-11-02 body 1\n#2 2026-11-03 body 2",
		);
	});
});

describe("directionLines", () => {
	const line = (scope: string, newestTs: string, summary: string | null) => ({
		scope: scope as ScopeKey,
		newestTs,
		summary,
	});

	it("gives one line for each budgeted scope, from the oldest to the newest", () => {
		expect(
			directionLines(
				[
					line("project:a", "2026-11-07T12:00:00.000Z", "scope a summary"),
					line("global:prefs", "2026-11-10T12:00:00.000Z", "body 0; body 1"),
				],
				[],
				now,
			),
		).toBe("[project:a] 3d scope a summary\n[global:prefs] 0d body 0; body 1");
	});

	it("puts each older scope in one comma list before the budgeted lines", () => {
		expect(
			directionLines(
				[line("project:c", "2026-11-10T17:45:00.000Z", "body 0")],
				["project:b", "project:a"],
				now,
			),
		).toBe("[project:b,project:a]\n[project:c] 0d body 0");
	});

	it("leaves the head without text when the scope holds no live note", () => {
		expect(
			directionLines(
				[line("project:a", "2026-11-10T12:00:00.000Z", null)],
				[],
				now,
			),
		).toBe("[project:a] 0d");
	});

	it("gives an empty block for no scope", () => {
		expect(directionLines([], [], now)).toBe("");
	});
});

describe("renderContext", () => {
	const input = () => {
		const store = newStore();
		addLive(store, 2);
		addNode(store, {
			level: 1,
			start: 0,
			summary: "root summary",
			a_key: leafKey("project:a", 0),
			b_key: leafKey("project:a", 1),
		});
		return {
			scope: "project:a" as ScopeKey,
			here: viewOf(store),
			hereBudget: 4,
			directions: [
				{
					scope: "project:a" as ScopeKey,
					newestTs: "2026-11-10T12:00:00.000Z",
					summary: "root summary",
				},
			],
			older: [],
			now,
		};
	};

	it("fills the template with the policy, the guide lines, and both parts", () => {
		const text = renderContext(input());
		expect(text).toContain("<memory>\n<how-to>\n");
		expect(text).toContain(POLICY);
		expect(text).toContain(
			"One line for each scope: the key in brackets, the age, and the newest summary.",
		);
		expect(text).toContain("[project:a] 0d root summary");
		expect(text).toContain('<here scope="project:a">');
		expect(text).toContain("#0 2026-11-01 body 0");
		expect(text).not.toContain("{{");
		expect(text).not.toContain("__catalog__");
		expect(text).not.toContain("review_at");
	});

	it("gives the same text for the same inputs", () => {
		const sample = input();
		expect(renderContext(sample)).toBe(renderContext(sample));
	});

	it("replaces the whole template with customPrompt and keeps the placeholders", () => {
		const text = renderContext({
			...input(),
			customPrompt: "P {{policy}}|{{scope}}|{{directions}}|{{here}}|{{append}}",
		});
		expect(text.startsWith(`P ${POLICY}|project:a|`)).toBe(true);
		expect(text.endsWith("|")).toBe(true);
	});

	it("fills the append placeholder with customPromptAppend before the append value", () => {
		expect(
			renderContext({ ...input(), customPromptAppend: "extra rules" }),
		).toContain("\nextra rules\n</how-to>");
		expect(renderContext({ ...input(), append: "plain append" })).toContain(
			"\nplain append\n</how-to>",
		);
	});

	it("keeps placeholder text inside each inserted value unchanged", () => {
		const literal =
			"{{policy}} {{append}} {{scope}} {{directions}} {{here}} $& $` $'";
		const text = renderContext({
			...input(),
			customPrompt: "{{policy}}|{{append}}|{{directions}}|{{here}}|{{unknown}}",
			policy: literal,
			customPromptAppend: literal,
			directions: [{ scope: "project:a", newestTs: now, summary: literal }],
			here: [{ kind: "record", pos: 0, from: now, to: now, body: literal }],
		});
		expect(text).toBe(
			`${literal}|${literal}|[project:a] 0d ${literal}|#0 2026-11-10 ${literal}|{{unknown}}`,
		);
	});

	it("keeps the CONTEXT_TEMPLATE a copy of the product text", () => {
		expect(CONTEXT_TEMPLATE).toContain("<how-to>\n{{policy}}\n{{append}}");
		expect(CONTEXT_TEMPLATE).toContain("{{directions}}\n</directions>");
		expect(CONTEXT_TEMPLATE).toContain('<here scope="{{scope}}">');
	});
});

describe("frontier of a view", () => {
	it("gives the same lines as the here part", () => {
		const store = newStore();
		addLive(store, 5);
		const lines = sliceOf(viewOf(store), 2);
		expect(lines).toHaveLength(2);
		expect(hereLines(viewOf(store), 2).split("\n")).toHaveLength(2);
	});
});
