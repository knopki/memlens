/**
 * #region moduleContract
 * @purpose Check the serializable console models, the scope boundary, and the store state.
 * @scope The store branch over rows written by raw SQL, and the projection branch of the frontends.
 * @invariants The frontier and the text of one read use the same slice lines.
 * @keywords test, console, model, frontier, catalog, directions, review, candidates
 * #endregion moduleContract
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadBaseConfig, resolveConfig } from "../src/domain/config.js";
import { readConsole } from "../src/domain/console.js";
import { Store } from "../src/store/store.js";
import type { ScopeKey } from "../src/types/events.js";

const now = "2026-11-10T12:00:00.000Z";
const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const config = () =>
	resolveConfig(
		loadBaseConfig(
			`
defaultProfile = "work"
[store]
backend = "sqlite"
[compaction]
provider = "test"
model = "test"
[profile.work]
scopes = ["project:*", "global:empty"]
budget = { here = 2, directions = 1 }
[scope_default]
default = "project:new"
`,
			"/unused",
		),
		{},
		null,
	);

/** @purpose Open one empty store in a temporary directory. */
function newStore(): Store {
	const dir = mkdtempSync(join(tmpdir(), "memlens-console-"));
	dirs.push(dir);
	return new Store(dir);
}

/** One note row of a test fixture. */
interface Row {
	readonly scope?: string;
	readonly pos: number;
	readonly body: string;
	readonly state?: "live" | "hidden" | "deleted";
	readonly kind?: string;
	readonly ts?: string;
	readonly review_at?: string | null;
}

const INSERT_NOTE = `INSERT INTO notes
	(id, scope, pos, state, kind, body, longform, refs, ts, created_at, modified_at, review_at, v, v_content)
	VALUES (?, ?, ?, ?, ?, ?, NULL, '[]', ?, ?, ?, ?, ?, ?)`;

/** @purpose Add one note row by raw SQL. */
function addNote(store: Store, row: Row): void {
	const scope = row.scope ?? "project:a";
	const ts = row.ts ?? now;
	const version = `v-${scope}-${row.pos}`;
	store
		.handle()
		.prepare(INSERT_NOTE)
		.run(
			`id-${scope}-${row.pos}`,
			scope,
			row.pos,
			row.state ?? "live",
			row.kind ?? "fact",
			row.body,
			ts,
			ts,
			ts,
			row.review_at ?? null,
			version,
			version,
		);
}

/** @purpose Add one node row by raw SQL. */
function addNode(
	store: Store,
	node: {
		readonly scope?: string;
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
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			node.scope ?? "project:a",
			node.level,
			node.start,
			node.summary,
			now,
			now,
			`build-${node.level}-${node.start}`,
			node.a_key,
			node.b_key,
		);
}

/** @purpose Give the validity key of one live leaf. */
const leafKey = (scope: string, pos: number): string =>
	`v-${scope}-${pos}|live`;

/** @purpose Write one live note for each position of a range. */
function addLive(store: Store, count: number, scope = "project:a"): void {
	for (let pos = 0; pos < count; pos += 1)
		addNote(store, { scope, pos, body: `note ${pos}` });
}

describe("store console", () => {
	it("keeps explicit empty scopes and accepts an absent wildcard default", async () => {
		const store = newStore();
		const model = await readConsole(store, config(), "project:new", now);
		expect(model.profile).toBe("work");
		expect(model.scope).toBe("project:new");
		expect(model.scopes.map((item) => item.key)).toEqual([
			"global:empty",
			"project:new",
		]);
		expect(model.frontier).toEqual([]);
		expect(model.text).toContain('<here scope="project:new">');
		await expect(
			readConsole(store, config(), "other:scope" as ScopeKey, now),
		).rejects.toThrow("Scope is not visible");
	});

	it("gives the scope panels, the frontier, and the budget from the rows", async () => {
		const store = newStore();
		addLive(store, 3);
		addNote(store, { pos: 3, body: "gone", state: "hidden" });
		const model = await readConsole(store, config(), "project:a", now);
		expect(model.scopes[0]).toMatchObject({
			key: "project:a",
			total: 4,
			live: 3,
			hidden: 1,
			deleted: 0,
		});
		expect(model.frontier).toHaveLength(2);
		expect(model.budgets.here).toEqual({ used: 2, limit: 2 });
		expect(model.records).toHaveLength(4);
		expect(model.revision).toBe(store.rev());
		expect(model.here).toBe(
			"#0-1 2026-11-10 note 0; note 1\n#2 2026-11-10 note 2",
		);
	});

	it("lists the due notes and the next notes of the selected scope only", async () => {
		const store = newStore();
		addNote(store, { pos: 0, body: "due here", review_at: "2026-11-01" });
		addNote(store, { pos: 1, body: "next here", review_at: "2026-12-01" });
		addNote(store, {
			pos: 2,
			body: "task of project:a",
			review_at: "2026-12-02",
			kind: "task",
		});
		addNote(store, {
			scope: "project:b",
			pos: 0,
			body: "due there",
			review_at: "2026-11-01",
		});
		const model = await readConsole(store, config(), "project:a", now);
		expect(model.review.map((record) => record.body)).toEqual(["due here"]);
		expect(model.reviewNextTotal).toBe(2);
		const task = await readConsole(store, config(), "project:a", now, "task");
		expect(task.reviewNext.map((record) => record.body)).toEqual([
			"task of project:a",
		]);
		expect(task.reviewNextTotal).toBe(1);
	});

	it("keeps a valid node clean through a review", async () => {
		const store = newStore();
		addLive(store, 2);
		addNode(store, {
			level: 1,
			start: 0,
			summary: "pair",
			a_key: leafKey("project:a", 0),
			b_key: leafKey("project:a", 1),
		});
		const clean = await readConsole(store, config(), "project:a", now);
		expect(clean.candidates).toEqual([]);
		expect(clean.nodes).toHaveLength(1);
		expect(clean.nodes[0]).toMatchObject({ scope: "project:a", clean: true });
		store
			.handle()
			.prepare("UPDATE notes SET review_at = '2099-01-01' WHERE pos = 0")
			.run();
		const model = await readConsole(store, config(), "project:a", now);
		expect(model.candidates).toEqual([]);
		expect(model.nodes[0]).toMatchObject({ clean: true });
	});

	it("reports clean nodes, the candidates, the review dates, and a custom context", async () => {
		const store = newStore();
		addLive(store, 4);
		addNode(store, {
			level: 1,
			start: 0,
			summary: "first pair",
			a_key: leafKey("project:a", 0),
			b_key: leafKey("project:a", 1),
		});
		const custom = config();
		custom.customPrompt = "{{scope}}|{{here}}|{{directions}}|{{append}}";
		custom.customPromptAppend = "extra";
		const model = await readConsole(store, custom, "project:a", now);
		expect(model.nodes).toHaveLength(1);
		expect(model.nodes[0]).toMatchObject({ scope: "project:a", clean: true });
		expect(model.frontier.length).toBeLessThanOrEqual(2);
		const wide = config();
		wide.budget.here = 4;
		const full = await readConsole(store, wide, "project:a", now);
		expect(full.frontier).toHaveLength(4);
		expect(full.frontier.map((line) => line.kind)).toEqual([
			"record",
			"record",
			"record",
			"record",
		]);
		expect(model.frontier.map((line) => line.kind)).toEqual([
			"record",
			"record",
		]);
		expect(model.candidates).toContainEqual({
			scope: "project:a",
			range: { start: 2, level: 1 },
			ready: true,
		});
		expect(model.candidates).toContainEqual({
			scope: "project:a",
			range: { start: 0, level: 2 },
			ready: true,
		});
		expect(model.budgets.here).toEqual({ used: 2, limit: 2 });
		expect(model.budgets.directions).toEqual({ used: 1, limit: 1 });
		expect(model.catalog).toHaveLength(1);
		expect(model.text).toBe(
			`${model.scope}|${model.here}|${model.directions}|extra`,
		);
		expect(
			(
				await readConsole(
					store,
					custom,
					"project:a",
					"2026-11-09T00:00:00.000Z",
				)
			).review,
		).toEqual([]);
		store
			.handle()
			.prepare(
				"UPDATE notes SET body = 'changed', v_content = 'v2' WHERE pos = 0",
			)
			.run();
		const changed = await readConsole(store, custom, "project:a", now);
		expect(changed.nodes[0]).toMatchObject({ clean: false });
		expect(changed.candidates).toContainEqual({
			scope: "project:a",
			range: { start: 0, level: 1 },
			ready: true,
		});
		expect(changed.candidates).toContainEqual({
			scope: "project:a",
			range: { start: 0, level: 1 },
			ready: true,
		});
	});

	it("puts each older scope before the budgeted direction line", async () => {
		const store = newStore();
		addNote(store, {
			scope: "project:a",
			pos: 0,
			body: "old scope",
			ts: "2026-11-01T00:00:00.000Z",
		});
		addNote(store, {
			scope: "project:b",
			pos: 0,
			body: "new scope",
			ts: "2026-11-09T00:00:00.000Z",
		});
		const model = await readConsole(store, config(), "project:a", now);
		expect(model.catalogScopes).toEqual(["project:b"]);
		expect(model.directions).toBe("[project:a]\n[project:b] 1d new scope");
	});
});
