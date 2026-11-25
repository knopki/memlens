/**
 * #region moduleContract
 * @purpose Prove that each console screen answers only its own data from selective store reads.
 * @scope The scope counts, the overview context, the tree, the catalog, the review, the
 *   maintenance, and the session answers, and the SQL of one read.
 * @invariants Each test writes its rows by raw SQL, so the read meets the exact store states.
 * @keywords test, console, screen, overview, session, catalog, review, maintenance, sql
 * #endregion moduleContract
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { loadBaseConfig, resolveConfig } from "../src/domain/config.js";
import type { ResolvedConfig } from "../src/domain/config-types.js";
import {
	type ConsoleModel,
	type ConsoleScreen,
	readConsole,
} from "../src/domain/console.js";
import {
	type ConsoleChildren,
	type ConsoleEntry,
	consoleOpen,
	consoleSearch,
} from "../src/domain/console-backend.js";
import { hereLines } from "../src/domain/context.js";
import { Store } from "../src/store/store.js";
import { loadView, sliceOf } from "../src/store/view.js";
import type { ScopeKey } from "../src/types/primitives.js";

const NOW = "2026-11-10T12:00:00.000Z";

const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

afterEach(() => vi.restoreAllMocks());

function config(
	options: {
		readonly here?: number;
		readonly directions?: number;
		readonly scopes?: readonly string[];
	} = {},
): ResolvedConfig {
	const here = options.here ?? 2;
	const directions = options.directions ?? 1;
	const scopes = (options.scopes ?? ["project:*", "global:empty"])
		.map((glob) => `"${glob}"`)
		.join(", ");
	return resolveConfig(
		loadBaseConfig(
			`
defaultProfile = "work"
[store]
[compaction]
provider = "test"
model = "test"
[profile.work]
scopes = [${scopes}]
budget = { here = ${here}, directions = ${directions} }
[scope_default]
default = "project:new"
`,
			"/unused",
		),
		{},
		null,
	);
}

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
	readonly longform?: string;
	readonly review_at?: string | null;
}

const INSERT_NOTE = `INSERT INTO notes
	(id, scope, pos, state, kind, body, longform, refs, ts, created_at, modified_at, review_at, v, v_content)
	VALUES (?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?)`;

function addNote(store: Store, row: Row): void {
	const scope = row.scope ?? "project:a";
	const ts = row.ts ?? NOW;
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
			row.longform ?? null,
			ts,
			ts,
			ts,
			row.review_at ?? null,
			version,
			version,
		);
}

function addLive(store: Store, count: number, scope = "project:a"): void {
	for (let pos = 0; pos < count; pos += 1)
		addNote(store, { scope, pos, body: `note ${pos}` });
}

const leafKey = (scope: string, pos: number): string =>
	`v-${scope}-${pos}|live`;

/** One summary row of a test fixture. */
interface NodeRow {
	readonly scope?: string;
	readonly level: number;
	readonly start: number;
	readonly summary: string;
	readonly a_key: string | null;
	readonly b_key: string | null;
}

function addNode(store: Store, node: NodeRow): void {
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
			NOW,
			NOW,
			`build-${node.level}-${node.start}`,
			node.a_key,
			node.b_key,
		);
}

const DATA_KEYS = [
	"text",
	"budgets",
	"frontier",
	"catalog",
	"catalogScopes",
	"review",
	"reviewNext",
	"reviewNextTotal",
	"totals",
	"levels",
	"candidates",
] as const;

const SCREEN_KEYS: Record<ConsoleScreen, readonly string[]> = {
	overview: ["text", "budgets"],
	session: ["text", "budgets"],
	tree: ["frontier"],
	catalog: ["catalog", "catalogScopes"],
	search: [],
	review: ["review", "reviewNext", "reviewNextTotal"],
	proposals: [],
	maintenance: ["totals", "levels", "candidates", "budgets"],
};

/** Give one console model without its screen, so two screens compare by their data. */
function bodyOf(model: ConsoleModel): Record<string, unknown> {
	const copy = { ...model } as Partial<ConsoleModel>;
	delete copy.screen;
	return copy as unknown as Record<string, unknown>;
}

function dataKeys(model: ConsoleModel): string[] {
	const fields = model as unknown as Record<string, unknown>;
	return DATA_KEYS.filter((key) => fields[key] !== undefined);
}

/** One call of a prepared statement, with the text and the arguments of the call. */
interface StatementCall {
	readonly sql: string;
	readonly args: readonly unknown[];
}

/** Watch each prepare and each call of one test store, so a test counts reads. */
function watchSql(store: Store): {
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
				calls.push({ sql: normalized, args });
				return statement.get(...args);
			},
			all: (...args: unknown[]) => {
				calls.push({ sql: normalized, args });
				return statement.all(...args);
			},
		} as unknown as ReturnType<typeof db.prepare>;
	}) as typeof db.prepare);
	return { sql, calls };
}

describe("console screens", () => {
	it("defaults to the overview and keeps an explicit empty scope", async () => {
		const store = newStore();
		const model = await readConsole(store, config(), "project:new", NOW);
		expect(model.screen).toBe("overview");
		expect(model.profile).toBe("work");
		expect(model.scope).toBe("project:new");
		expect(model.revision).toBe(store.rev());
		expect(model.scopes).toEqual([
			{ key: "global:empty", total: 0, live: 0, hidden: 0, deleted: 0 },
			{ key: "project:new", total: 0, live: 0, hidden: 0, deleted: 0 },
		]);
		expect(model.text).toContain('<here scope="project:new">');
		expect(model.budgets).toEqual({
			here: { used: 0, limit: 2 },
			directions: { used: 0, limit: 1 },
		});
		await expect(
			readConsole(store, config(), "other:scope" as ScopeKey, NOW),
		).rejects.toThrow("Scope is not visible");
		const explicit = await readConsole(
			store,
			config(),
			"project:new",
			NOW,
			null,
			"overview",
		);
		expect(explicit).toEqual(model);
	});

	it("gives the scope counts, the context text, and the budgets without previews", async () => {
		const store = newStore();
		addLive(store, 6);
		addNote(store, { pos: 6, body: "gone", state: "hidden" });
		const model = await readConsole(
			store,
			config({ here: 4 }),
			"project:a",
			NOW,
		);
		const counts = model.scopes.find((row) => row.key === "project:a");
		expect(counts).toMatchObject({
			total: 7,
			live: 6,
			hidden: 1,
			deleted: 0,
		});
		expect(counts).not.toHaveProperty("frontier");
		expect(model.frontier).toBeUndefined();
		const frontier = sliceOf(loadView(store.handle(), "project:a"), 4);
		expect(model.text).toContain(hereLines(frontier, 4));
		expect(model.text).toContain("[project:a] 0d");
		expect(model.budgets).toEqual({
			here: { used: 4, limit: 4 },
			directions: { used: 1, limit: 1 },
		});
	});

	it("answers only the data keys of the requested screen", async () => {
		const store = newStore();
		addLive(store, 2);
		for (const screen of Object.keys(SCREEN_KEYS) as ConsoleScreen[]) {
			const model = await readConsole(
				store,
				config(),
				"project:a",
				NOW,
				null,
				screen,
			);
			expect(model.screen).toBe(screen);
			expect(dataKeys(model).sort()).toEqual([...SCREEN_KEYS[screen]].sort());
			for (const removed of ["records", "nodes", "here", "directions"])
				expect(model).not.toHaveProperty(removed);
		}
		const overview = await readConsole(store, config(), "project:a", NOW);
		const session = await readConsole(
			store,
			config(),
			"project:a",
			NOW,
			null,
			"session",
		);
		for (const model of [overview, session])
			expect(model.scopes.every((row) => !("frontier" in row))).toBe(true);
	});

	it("answers the overview like the session except for its screen", async () => {
		const store = newStore();
		for (const pos of [0, 1, 2, 3])
			addNote(store, {
				scope: "project:a",
				pos,
				body: `a${pos}`,
				ts: "2026-11-01T00:00:00.000Z",
			});
		addNote(store, {
			scope: "project:b",
			pos: 0,
			body: "b top",
			ts: "2026-11-09T00:00:00.000Z",
		});
		const overview = await readConsole(store, config(), "project:a", NOW);
		const session = await readConsole(
			store,
			config(),
			"project:a",
			NOW,
			null,
			"session",
		);
		expect(overview.screen).toBe("overview");
		expect(session.screen).toBe("session");
		expect(bodyOf(overview)).toEqual(bodyOf(session));
		expect(overview.text).toBe(session.text);
		expect(overview.text).toContain("b top");
		expect(overview.text).toContain("[project:a]");
		expect(overview.budgets).toEqual(session.budgets);
	});

	it("gives the tree frontier and the catalog leaf of a scope", async () => {
		const store = newStore();
		addLive(store, 2);
		addNode(store, {
			level: 1,
			start: 0,
			summary: "pair summary",
			a_key: leafKey("project:a", 0),
			b_key: leafKey("project:a", 1),
		});
		const tree = await readConsole(
			store,
			config(),
			"project:a",
			NOW,
			null,
			"tree",
		);
		expect(tree.frontier).toEqual(
			sliceOf(loadView(store.handle(), "project:a"), 2),
		);
		const catalog = await readConsole(
			store,
			config(),
			"project:a",
			NOW,
			null,
			"catalog",
		);
		expect(catalog.catalog).toEqual([
			{
				kind: "summary",
				range: { start: 0, level: 0 },
				from: NOW,
				to: NOW,
				summary: "pair summary",
			},
		]);
		expect(catalog.catalogScopes).toEqual(["project:a"]);
	});

	it("puts one top line of each budgeted scope into the catalog", async () => {
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
		const model = await readConsole(
			store,
			config({ directions: 2 }),
			"project:a",
			NOW,
			null,
			"catalog",
		);
		expect(model.catalogScopes).toEqual(["project:a", "project:b"]);
		expect(model.catalog).toEqual([
			{
				kind: "temporary",
				range: { start: 0, level: 0 },
				from: "2026-11-01T00:00:00.000Z",
				to: "2026-11-01T00:00:00.000Z",
				text: "old scope",
			},
			{
				kind: "temporary",
				range: { start: 1, level: 0 },
				from: "2026-11-09T00:00:00.000Z",
				to: "2026-11-09T00:00:00.000Z",
				text: "new scope",
			},
		]);
	});

	it("lists the due and the next review rows of the selected scope", async () => {
		const store = newStore();
		addNote(store, { pos: 0, body: "due here", review_at: "2026-11-01" });
		addNote(store, { pos: 1, body: "next here", review_at: "2026-12-01" });
		addNote(store, {
			pos: 2,
			body: "task of project:a",
			kind: "task",
			review_at: "2026-12-02",
		});
		addNote(store, {
			scope: "project:b",
			pos: 0,
			body: "due there",
			review_at: "2026-11-01",
		});
		const model = await readConsole(
			store,
			config(),
			"project:a",
			NOW,
			null,
			"review",
		);
		expect(model.review).toEqual([
			{
				addr: "project:a#0",
				scope: "project:a",
				pos: 0,
				ts: NOW,
				kind: "fact",
				body: "due here",
				review_at: "2026-11-01",
			},
		]);
		expect(model.reviewNext?.map((record) => record.body)).toEqual([
			"next here",
			"task of project:a",
		]);
		expect(model.reviewNextTotal).toBe(2);
		const tasks = await readConsole(
			store,
			config(),
			"project:a",
			NOW,
			"task",
			"review",
		);
		expect(tasks.review).toEqual([]);
		expect(tasks.reviewNext?.map((record) => record.body)).toEqual([
			"task of project:a",
		]);
		expect(tasks.reviewNextTotal).toBe(1);
	});

	it("gives the build totals and the counts by level", async () => {
		const store = newStore();
		addLive(store, 4);
		addNode(store, {
			level: 1,
			start: 0,
			summary: "pair",
			a_key: leafKey("project:a", 0),
			b_key: leafKey("project:a", 1),
		});
		store
			.handle()
			.prepare("UPDATE notes SET v_content = 'changed' WHERE pos = 0")
			.run();
		const model = await readConsole(
			store,
			config(),
			"project:a",
			NOW,
			null,
			"maintenance",
		);
		expect(model.candidates).toEqual([
			{ scope: "project:a", range: { start: 0, level: 1 }, ready: true },
			{ scope: "project:a", range: { start: 2, level: 1 }, ready: true },
			{ scope: "project:a", range: { start: 0, level: 2 }, ready: true },
		]);
		expect(model.levels).toEqual([
			{ level: 1, nodes: 1, dirty: 1, candidates: 2 },
			{ level: 2, nodes: 0, dirty: 0, candidates: 1 },
		]);
		expect(model.totals).toEqual({ records: 4, nodes: 1, candidates: 3 });
		expect(model.budgets).toEqual({
			here: { used: 2, limit: 2 },
			directions: { used: 1, limit: 1 },
		});
	});

	it("gives the session text of the here block and the budgeted directions", async () => {
		const store = newStore();
		addNote(store, {
			scope: "project:a",
			pos: 0,
			body: "a0",
			ts: "2026-11-01T00:00:00.000Z",
		});
		addNote(store, {
			scope: "project:a",
			pos: 1,
			body: "a1",
			ts: "2026-11-01T00:00:00.000Z",
		});
		addNote(store, {
			scope: "project:b",
			pos: 0,
			body: "b top",
			ts: "2026-11-09T00:00:00.000Z",
		});
		addNote(store, {
			scope: "project:c",
			pos: 0,
			body: "c unrelated",
			longform: "c document",
			ts: "2026-11-05T00:00:00.000Z",
		});
		const model = await readConsole(
			store,
			config(),
			"project:a",
			NOW,
			null,
			"session",
		);
		expect(model.text).toContain('<here scope="project:a">');
		expect(model.text).toContain("[project:c,project:a]");
		expect(model.text).toContain("b top");
		expect(model.text).not.toContain("c unrelated");
		expect(model.text).not.toContain("c document");
		expect(model.budgets).toEqual({
			here: { used: 2, limit: 2 },
			directions: { used: 1, limit: 1 },
		});
		expect(model.scopes.every((row) => !("frontier" in row))).toBe(true);
	});

	it("gives the console fields of one note and the text of one range", () => {
		const store = newStore();
		addLive(store, 2);
		store
			.handle()
			.prepare(
				"UPDATE notes SET longform = 'document zero', session = 'sess', preset = 'preset', superseded_by = 'id-project:a-1' WHERE pos = 0",
			)
			.run();
		const host = { store, config: config(), scopes: ["project:a" as ScopeKey] };
		const entry = consoleOpen(host, { target: "project:a#0" }, "project:a");
		expect(entry).toMatchObject({
			kind: "entry",
			addr: "project:a#0",
			pos: 0,
			body: "note 0",
			longform: "document zero",
			longformChars: 13,
			longformTruncated: false,
			noteKind: "fact",
			state: "live",
			session: "sess",
			preset: "preset",
			superseded_by: "id-project:a-1",
			supersedes: [],
		} satisfies Partial<ConsoleEntry>);
		const next = consoleOpen(host, { target: "project:a#1" }, "project:a");
		expect(next).toMatchObject({ supersedes: ["id-project:a-0"] });
		const children = consoleOpen(
			host,
			{ target: "project:a#0-1" },
			"project:a",
		);
		expect(children).toMatchObject({
			kind: "children",
			text: "note 0\ndocument zero; note 1",
		} satisfies Partial<ConsoleChildren>);
		expect(children.kind === "children" ? children.children : []).toEqual([
			{
				addr: "project:a#0",
				ts_from: NOW,
				ts_to: NOW,
				text: "note 0",
				built: true,
				chars: 6,
			},
			{
				addr: "project:a#1",
				ts_from: NOW,
				ts_to: NOW,
				text: "note 1",
				built: true,
				chars: 6,
			},
		]);
	});
});

describe("selective SQL", () => {
	it("reads no scope outside the selected scope and the directions budget", async () => {
		const store = newStore();
		for (const pos of [0, 1, 2])
			addNote(store, {
				scope: "project:a",
				pos,
				body: `a${pos}`,
				ts: "2026-11-01T00:00:00.000Z",
			});
		addNote(store, {
			scope: "project:b",
			pos: 0,
			body: "b latest",
			ts: "2026-11-09T00:00:00.000Z",
		});
		addNote(store, {
			scope: "project:c",
			pos: 0,
			body: "c body",
			longform: "c document",
			ts: "2026-11-05T00:00:00.000Z",
		});
		const watch = watchSql(store);
		const model = await readConsole(store, config(), "project:a", NOW);
		expect(model.text).toContain("b latest");
		expect(model.text).not.toContain("c body");
		const content = watch.calls.filter((call) =>
			/\bpos\b|\bbody\b|\blongform\b|v_content/.test(call.sql),
		);
		expect(content.filter((call) => call.args.includes("project:c"))).toEqual(
			[],
		);
		const slots = watch.calls
			.filter((call) => /SELECT pos FROM notes WHERE scope = \?/.test(call.sql))
			.map((call) => call.args[0]);
		expect(slots.sort()).toEqual(["project:a", "project:b"]);
	});

	it("reads no document for a catalog of clean summaries", async () => {
		const store = newStore();
		addLive(store, 4);
		addNode(store, {
			level: 1,
			start: 0,
			summary: "pair one",
			a_key: leafKey("project:a", 0),
			b_key: leafKey("project:a", 1),
		});
		addNode(store, {
			level: 1,
			start: 2,
			summary: "pair two",
			a_key: leafKey("project:a", 2),
			b_key: leafKey("project:a", 3),
		});
		addNode(store, {
			level: 2,
			start: 0,
			summary: "all four",
			a_key: "build-1-0",
			b_key: "build-1-2",
		});
		const watch = watchSql(store);
		const model = await readConsole(
			store,
			config(),
			"project:a",
			NOW,
			null,
			"catalog",
		);
		expect(model.catalog).toEqual([
			{
				kind: "summary",
				range: { start: 0, level: 0 },
				from: NOW,
				to: NOW,
				summary: "all four",
			},
		]);
		expect(watch.sql.some((sql) => /FROM nodes/.test(sql))).toBe(true);
		expect(watch.sql.filter((sql) => /\blongform\b/i.test(sql))).toEqual([]);
		expect(watch.sql.filter((sql) => /select \*/i.test(sql))).toEqual([]);
		expect(
			watch.sql.filter((sql) => /FROM notes/.test(sql) && /\bbody\b/.test(sql)),
		).toEqual([]);
	});

	it("reads only the review columns of the due and next rows", async () => {
		const store = newStore();
		addNote(store, {
			pos: 0,
			body: "due",
			longform: "document",
			review_at: "2026-11-01",
		});
		const watch = watchSql(store);
		const model = await readConsole(
			store,
			config(),
			"project:a",
			NOW,
			null,
			"review",
		);
		expect(model.review?.map((record) => record.body)).toEqual(["due"]);
		expect(
			watch.sql.filter(
				(sql) => /\blongform\b/i.test(sql) || /select \*/i.test(sql),
			),
		).toEqual([]);
		expect(watch.sql.some((sql) => /review_at/.test(sql))).toBe(true);
	});

	it("reads only the hit columns of a search", () => {
		const store = newStore();
		addNote(store, { pos: 0, body: "needle here", longform: "document" });
		store
			.handle()
			.prepare("INSERT INTO fts (rowid, body, longform) VALUES (1, ?, ?)")
			.run("needle here", "document");
		const watch = watchSql(store);
		const hits = consoleSearch(
			{ store, config: config(), scopes: ["project:a"] },
			{ query: "needle", limit: "5" },
			"project:a",
		);
		expect(hits.map((hit) => hit.body)).toEqual(["needle here"]);
		expect(watch.sql.filter((sql) => /select \*/i.test(sql))).toEqual([]);
		const reads = watch.sql.filter((sql) => /FROM (notes|fts)/.test(sql));
		expect(reads.length).toBeGreaterThan(0);
		expect(reads.every((sql) => /LIMIT/i.test(sql))).toBe(true);
	});
});
