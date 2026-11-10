/**
 * #region moduleContract
 * @purpose Verify that both backends give the same complete search hits with one FTS5 engine.
 * @scope Search parity, query grammar, filters, state exclusion, and index rebuilds. No write-path checks.
 * @invariants The same source and query give the same hits in each backend.
 * Hidden, deleted, and cleared records never return.
 * #endregion moduleContract
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonlStore } from "../src/storage/jsonl.js";
import { SqliteStore } from "../src/storage/sqlite.js";
import type { AppendEvent, IndexHit, StorePort } from "../src/types/store.js";

const note = (
	body: string,
	scope = "project:a",
	extra: Partial<Extract<AppendEvent, { op: "note" }>> = {},
): Extract<AppendEvent, { op: "note" }> => ({
	op: "note",
	scope,
	body,
	kind: "note",
	ts: "2026-11-10T00:00:00.000Z",
	review_at: null,
	session: "s",
	turn: "t",
	preset: "p",
	...extra,
});

const comparable = (hits: readonly IndexHit[]) =>
	hits.map(
		({ addr, scope, pos, ts, kind, body, longformChars, review_at }) => ({
			addr,
			scope,
			pos,
			ts,
			kind,
			body,
			longformChars,
			review_at,
		}),
	);

const directories: string[] = [];
const stores: StorePort[] = [];

afterEach(async () => {
	await Promise.all(stores.splice(0).map((store) => store.close()));
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

/** Seed one store with the same records in both backends. */
async function seed(store: StorePort): Promise<void> {
	await store.append(
		note("redis cache for sessions", "project:a", {
			longform: "The cache stores session tokens with a redis TTL.",
			review_at: "2026-01-01",
		}),
	);
	await store.append(note("postgres migrations table", "project:a"));
	await store.append(note("redis cluster in the cache layer", "project:b"));
	await store.append(
		note("cache invalidation on write", "project:b", {
			longform: "A write invalidates the cache before the read.",
		}),
	);
	const hidden = await store.append(note("obsolete cache policy", "project:a"));
	await store.append({
		op: "hide",
		scope: "project:a",
		target: hidden.id,
		reason: "old",
	});
	const cleared = await store.append(
		note("SECRETWORD private scratch", "project:a"),
	);
	await store.append({
		op: "redact",
		scope: "project:a",
		target: cleared.id,
		reason: "erase",
	});
}

for (const [backend, Store] of [
	["sqlite", SqliteStore],
	["jsonl", JsonlStore],
] as const) {
	describe(`${Store.name} search`, () => {
		const open = async () => {
			const directory = await mkdtemp(
				join(tmpdir(), `memlens-find-${backend}-`),
			);
			directories.push(directory);
			const store: StorePort = new Store(directory);
			stores.push(store);
			return store;
		};

		it("returns complete hits with matching words", async () => {
			const store = await open();
			await seed(store);
			const hits = await store.search("redis cache", null, 10);
			expect(hits.map((hit) => hit.addr).sort()).toEqual([
				"project:a#0",
				"project:b#0",
			]);
			const hit = hits.find((item) => item.addr === "project:a#0");
			expect(hit).toMatchObject({
				scope: "project:a",
				pos: 0,
				ts: "2026-11-10T00:00:00.000Z",
				kind: "note",
				body: "redis cache for sessions",
				longformChars: 49,
				review_at: "2026-01-01",
			});
			for (const item of hits) expect(item.id).toMatch(/^[0-9A-Z]{26}$/);
		});

		it("keeps an excluded word out and refuses an exclusion-only query", async () => {
			const store = await open();
			await seed(store);
			const bodies = (await store.search("cache -redis", null, 10)).map(
				(hit) => hit.body,
			);
			expect(bodies).toEqual(["cache invalidation on write"]);
			expect(await store.search("-redis", null, 10)).toEqual([]);
		});

		it("matches a longform word and applies the scope filter", async () => {
			const store = await open();
			await seed(store);
			expect(
				(await store.search("tokens", null, 10)).map((hit) => hit.addr),
			).toEqual(["project:a#0"]);
			expect(
				(await store.search("cache", "project:a", 10)).map((hit) => hit.addr),
			).toEqual(["project:a#0"]);
		});

		it("applies the limit after the rank order", async () => {
			const store = await open();
			await seed(store);
			expect(await store.search("cache", null, 1)).toHaveLength(1);
			expect(await store.search("cache", null, 0)).toEqual([]);
		});

		it("returns no hidden or cleared record and no cleared text", async () => {
			const store = await open();
			await seed(store);
			const all = await store.search("", null, 50);
			expect(all.map((hit) => hit.body)).not.toContain("obsolete cache policy");
			expect(all.map((hit) => hit.body)).not.toContain(
				"SECRETWORD private scratch",
			);
			expect(await store.search("SECRETWORD", null, 10)).toEqual([]);
			expect(await store.search("scratch", null, 10)).toEqual([]);
		});

		it("gives the same hits after a reopen and after an index loss", async () => {
			const directory = await mkdtemp(
				join(tmpdir(), `memlens-find-reopen-${backend}-`),
			);
			directories.push(directory);
			const store: StorePort = new Store(directory);
			await seed(store);
			const before = comparable(await store.search("cache", null, 10));
			await store.close();
			const indexFile =
				backend === "jsonl"
					? join(directory, "index.db")
					: join(directory, "memlens.db");
			if (backend === "jsonl") await rm(indexFile);
			else {
				const { DatabaseSync } = await import("node:sqlite");
				const db = new DatabaseSync(indexFile);
				db.exec("DROP TABLE hits; DELETE FROM index_meta");
				db.close();
			}
			const reopened: StorePort = new Store(directory);
			stores.push(reopened);
			expect(comparable(await reopened.search("cache", null, 10))).toEqual(
				before,
			);
			expect(comparable(await reopened.search("SECRETWORD", null, 10))).toEqual(
				[],
			);
		});

		it("rebuilds with the trigram tokenizer after a language change", async () => {
			const directory = await mkdtemp(
				join(tmpdir(), `memlens-find-lang-${backend}-`),
			);
			directories.push(directory);
			const store: StorePort = new Store(directory);
			await store.append(note("データベースの接続設定", "project:a"));
			await store.close();
			const zh: StorePort = new Store(directory, new Map(), "zh");
			stores.push(zh);
			expect(await zh.search("接続設定", null, 10)).toHaveLength(1);
			await zh.close();
		});
	});
}

describe("search parity across backends", () => {
	const queries = ["redis cache", "cache -redis", "postgres", "tokens", ""];

	it("gives identical complete hits for the same source and after a reopen", async () => {
		const runs: (readonly ReturnType<typeof comparable>)[] = [];
		for (const Store of [SqliteStore, JsonlStore]) {
			const directory = await mkdtemp(
				join(tmpdir(), `memlens-parity-${Store.name}-`),
			);
			directories.push(directory);
			const store: StorePort = new Store(directory);
			stores.push(store);
			await seed(store);
			runs.push(
				(
					await Promise.all(
						queries.map((query) => store.search(query, null, 50)),
					)
				).map(comparable),
			);
			if (Store === JsonlStore) {
				await store.close();
				const reopened = new JsonlStore(directory);
				stores.push(reopened);
				runs.push(
					(
						await Promise.all(
							queries.map((query) => reopened.search(query, null, 50)),
						)
					).map(comparable),
				);
			}
		}
		const [sqlite, jsonl, reopened] = runs;
		expect(jsonl).toEqual(sqlite);
		expect(reopened).toEqual(sqlite);
	});
});
