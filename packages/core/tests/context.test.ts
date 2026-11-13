/**
 * #region moduleContract
 * @purpose Check the context template, the line forms, the ages, the budgets, and the epoch.
 * @scope The store branch over row views, the directions order, and the projection branch.
 * @invariants The fixtures write rows by raw SQL. The directions follow the store order of the scopes.
 * @keywords test, context, here, directions, budget, epoch, template
 * #endregion moduleContract
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	CONTEXT_TEMPLATE,
	directionLines,
	epoch,
	hereLines,
	POLICY,
	renderContext,
} from "../src/domain/context.js";
import { Store } from "../src/store/store.js";
import type { Node } from "../src/store/types.js";
import { loadView, sliceOf, type View } from "../src/store/view.js";
import type { ScopeKey } from "../src/types/events.js";

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

/** @purpose Open one empty store in a temporary directory. */
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

/** @purpose Add one note row by raw SQL. */
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

/** @purpose Add one node row by raw SQL. */
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

/** @purpose Give the validity key of one live leaf. */
const leafKey = (scope: string, pos: number): string =>
	`v-${scope}-${pos}|live`;

/** @purpose Give the view of one scope of the store. */
const viewOf = (store: Store, scope = "project:a"): View =>
	loadView(store.handle(), scope as ScopeKey);

/** @purpose Write one live note for each position of a range. */
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

	it("keeps the date of the period and drops the time of day", () => {
		const store = newStore();
		addNote(store, { pos: 0, body: "body 0", ts: "2026-11-01T08:38:36.760Z" });
		addNote(store, { pos: 1, body: "body 1", ts: "2026-11-02T09:00:00.000Z" });
		addNote(store, { pos: 2, body: "body 2", ts: "2026-11-03T08:38:36.760Z" });
		addNode(store, {
			level: 1,
			start: 0,
			summary: "first pair",
			a_key: leafKey("project:a", 0),
			b_key: leafKey("project:a", 1),
			ts_from: "2026-11-01T08:38:36.760Z",
			ts_to: "2026-11-02T09:00:00.000Z",
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
	const line = (scope: string, lastWrite: string, summary: string | null) => ({
		scope: scope as ScopeKey,
		lastWrite,
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
					lastWrite: "2026-11-10T12:00:00.000Z",
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
			"One line for each range of scopes: the keys, the age, and the summary.",
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

	it("keeps the CONTEXT_TEMPLATE a copy of the product text", () => {
		expect(CONTEXT_TEMPLATE).toContain("<how-to>\n{{policy}}\n{{append}}");
		expect(CONTEXT_TEMPLATE).toContain("{{directions}}\n</directions>");
		expect(CONTEXT_TEMPLATE).toContain('<here scope="{{scope}}">');
	});
});

describe("epoch", () => {
	it("changes with the store clock only", () => {
		expect(epoch("1")).toBe(epoch("1"));
		expect(epoch("1")).not.toBe(epoch("2"));
		expect(epoch("")).toBe(epoch(""));
	});

	it("gives a different key for each clock value of a store", () => {
		const store = newStore();
		const first = store.rev();
		store.publish(() => undefined);
		const second = store.rev();
		expect(second).not.toBe(first);
		expect(epoch(second)).not.toBe(epoch(first));
	});

	it("follows the clock of the store", () => {
		const store = newStore();
		const first = store.rev();
		addNote(store, { pos: 0, body: "changed" });
		store.publish(() => undefined);
		expect(store.rev()).not.toBe(first);
		expect(epoch(store.rev())).not.toBe(epoch(first));
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
