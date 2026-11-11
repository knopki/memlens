/**
 * #region moduleContract
 * @purpose Check serializable console models, scope boundaries, and tree state through both store ports.
 * #endregion moduleContract
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadBaseConfig, resolveConfig } from "../src/domain/config.js";
import { readConsole } from "../src/domain/console.js";
import { scopeTree } from "../src/domain/projection.js";
import { buildInput, rev } from "../src/domain/tree.js";
import { JsonlStore } from "../src/storage/jsonl.js";
import { SqliteStore } from "../src/storage/sqlite.js";
import type { AppendEvent, StorePort } from "../src/types/store.js";

const now = "2026-11-10T12:00:00.000Z";
const stores: StorePort[] = [];
const directories: string[] = [];
const config = () =>
	resolveConfig(
		loadBaseConfig(
			`
defaultProfile = "work"
[store]
backend = "sqlite"
[writer]
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
const note = (
	scope = "project:a",
	body = "visible",
): Extract<AppendEvent, { op: "note" }> => ({
	op: "note",
	scope,
	body,
	kind: "fact",
	ts: now,
	review_at: "2026-11-10",
	session: "s",
	turn: "t",
	preset: "p",
});

afterEach(async () => {
	for (const store of stores.splice(0)) await store.close();
	for (const directory of directories.splice(0)) {
		if (!directory.startsWith(join(tmpdir(), "memlens-console-")))
			throw new Error("Unexpected cleanup path");
		await rm(directory, { recursive: true, force: true });
	}
});

for (const Backend of [JsonlStore, SqliteStore]) {
	describe(Backend.name, () => {
		const open = async () => {
			const directory = await mkdtemp(join(tmpdir(), "memlens-console-"));
			directories.push(directory);
			const store = new Backend(directory);
			stores.push(store);
			return store;
		};

		it("keeps explicit empty scopes and accepts an absent wildcard default", async () => {
			const store = await open();
			const model = await readConsole(store, config(), "project:new", now);
			expect(model.profile).toBe("work");
			expect(model.scopes).toEqual([
				{
					key: "global:empty",
					total: 0,
					live: 0,
					hidden: 0,
					deleted: 0,
					frontier: "",
				},
				{
					key: "project:new",
					total: 0,
					live: 0,
					hidden: 0,
					deleted: 0,
					frontier: "",
				},
			]);
			expect(model.budgets).toEqual({
				here: { used: 0, limit: 2 },
				directions: { used: 0, limit: 1 },
			});
			expect(model.records).toEqual([]);
			expect(model.review).toEqual([]);
			expect(JSON.parse(JSON.stringify(model))).toEqual(model);
		});

		it("reads projection state without exports and excludes other scopes", async () => {
			const store = await open();
			const live = await store.append(note());
			const hidden = await store.append(note("project:a", "hidden"));
			const deleted = await store.append(note("project:a", "deleted"));
			await store.append({
				op: "hide",
				scope: "project:a",
				target: hidden.id,
				reason: "test",
			});
			await store.append({
				op: "redact",
				scope: "project:a",
				target: deleted.id,
				reason: "test",
			});
			await store.append(note("agent:secret", "private"));
			const exported = vi
				.spyOn(store, "export")
				.mockRejectedValue(new Error("No event scans"));
			const model = await readConsole(store, config(), "project:a", now);
			expect(exported).not.toHaveBeenCalled();
			expect(model.scopes[0]).toMatchObject({
				key: "project:a",
				total: 3,
				live: 1,
				hidden: 1,
				deleted: 1,
			});
			expect(model.records).toHaveLength(3);
			expect(
				model.records.every((record) => record.scope === "project:a"),
			).toBe(true);
			expect(model.review.map((record) => record.pos)).toEqual([0]);
			expect(model.records[0]?.id).toBe(live.id);
			expect(model.here).toContain("#0 2026-11-10 visible");
			expect(model.text).toContain(model.here);
			expect(model.directions).toContain("[project:a] 0m");
			expect(model.revision).toBe(await store.rev());
			expect(JSON.stringify(model)).not.toContain("private");
			await expect(
				readConsole(store, config(), "agent:secret", now),
			).rejects.toMatchObject({ code: "NotAllowed" });
			expect(
				(await readConsole(store, config(), "project:unknown", now)).scope,
			).toBe("project:unknown");
			await expect(
				readConsole(store, config(), "_catalog:work", now),
			).rejects.toMatchObject({ code: "NotAllowed" });
		});

		it("retries when a write separates the projection and revision reads", async () => {
			const store = await open();
			await store.append(note());
			const read = store.projection.bind(store);
			vi.spyOn(store, "projection").mockImplementationOnce(async () => {
				const earlier = await read();
				await store.append(note("project:a", "concurrent note"));
				return earlier;
			});
			const model = await readConsole(store, config(), "project:a", now);
			expect(model.records).toHaveLength(2);
			expect(model.revision).toBe(await store.rev());
		});

		it("reports clean nodes, ready candidates, review dates, and custom context", async () => {
			const store = await open();
			for (let pos = 0; pos < 4; pos += 1)
				await store.append(note("project:a", `note ${pos}`));
			const tree = scopeTree(await store.projection(), "project:a");
			const range = { start: 0, level: 1 };
			const input = buildInput(tree, range);
			if (!input) throw new Error("Build input is absent");
			await store.appendNode(input, {
				op: "node",
				scope: "project:a",
				start: 0,
				level: 1,
				child_a: input.children[0]?.id ?? null,
				child_b: input.children[1]?.id ?? null,
				input_rev: rev(tree, range),
				summary: "first pair",
				chars: 10,
				truncated: false,
				ts_from: now,
				ts_to: now,
			});
			const custom = config();
			custom.customPrompt = "{{scope}}|{{here}}|{{directions}}|{{append}}";
			custom.customPromptAppend = "extra";
			const model = await readConsole(store, custom, "project:a", now);
			expect(model.nodes).toHaveLength(1);
			expect(model.nodes[0]).toMatchObject({ scope: "project:a", clean: true });
			expect(model.frontier.length).toBeLessThanOrEqual(2);
			const wide = config();
			wide.budget.here = 3;
			const full = await readConsole(store, wide, "project:a", now);
			const covered = full.frontier.filter((line) => line.kind === "summary");
			const leaves = full.frontier
				.filter((line) => line.kind === "record")
				.map((line) => line.pos);
			expect(covered.length).toBeGreaterThan(0);
			for (const line of covered) {
				const from = line.range.start;
				const to = from + 2 ** line.range.level;
				expect(leaves.some((pos) => pos >= from && pos < to)).toBe(false);
			}
			expect(model.candidates).toContainEqual({
				scope: "project:a",
				range: { start: 2, level: 1 },
				ready: true,
			});
			expect(model.candidates).toContainEqual({
				scope: "project:a",
				range: { start: 0, level: 2 },
				ready: false,
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
			await store.append({
				op: "amend",
				scope: "project:a",
				target: input.children[0]?.id ?? "",
				body: "changed",
			});
			const changed = await readConsole(store, custom, "project:a", now);
			expect(changed.nodes).toEqual([]);
			expect(changed.candidates).toContainEqual({
				scope: "project:a",
				range,
				ready: true,
			});
			expect(changed.revision).not.toBe(model.revision);
		});
	});
}
