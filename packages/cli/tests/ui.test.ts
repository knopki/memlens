/**
 * #region moduleContract
 * @purpose Verify console actions and the HTTP trust boundary against both persistent backends.
 * @invariants Tests use temporary stores and ephemeral loopback ports.
 * #endregion moduleContract
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { note, propose, scopeNotes } from "@memlens/core";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_CONFIG_TOML, openRuntime } from "../src/runtime.js";
import { startUi } from "../src/ui.js";

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => {
	for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

// #region FUNC_fixture
/** @purpose Open an isolated console with its own configuration and store. */
async function fixture(backend: string, allowDelete = false, scopes = '["*"]') {
	const root = await mkdtemp(join(tmpdir(), "memlens-ui-"));
	cleanups.push(() => rm(root, { recursive: true, force: true }));
	const config = join(root, "config", "memlens");
	await mkdir(config, { recursive: true });
	await writeFile(
		join(config, "config.toml"),
		DEFAULT_CONFIG_TOML.replace('scopes = ["*"]', `scopes = ${scopes}`),
	);
	const env = {
		XDG_CONFIG_HOME: join(root, "config"),
		XDG_DATA_HOME: join(root, "data"),
	};
	const host = await startUi({
		storeFlag: join(root, "store"),
		cwd: root,
		env,
		port: 0,
		allowDelete,
	});
	cleanups.push(host.close);
	const get = async (path = "/api/view") => {
		const response = await fetch(`${host.url}${path}`);
		expect(response.status).toBe(200);
		return response.json();
	};
	const post = (fields: Record<string, unknown>) =>
		fetch(`${host.url}/api/action`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ scope: "user:notes", ...fields }),
		});
	return { host, env, root, get, post };
}
// #endregion FUNC_fixture

describe("console", () => {
	const backend = "sqlite";
	it("creates, amends, finds, reviews, supersedes, hides, and clears notes", async () => {
		const { get, post } = await fixture(backend, true);
		expect(
			(
				await post({
					action: "note",
					body: "alpha memory",
					longform: "document",
					kind: "fact",
				})
			).status,
		).toBe(200);
		let view = await get();
		expect(view.records).toHaveLength(1);
		expect(view.here).toContain("alpha memory");
		const target = `user:notes#${view.records[0].pos}`;
		expect(
			(await get(`/api/open?target=${encodeURIComponent(target)}`)).longform,
		).toBe("document");
		expect(
			(
				await post({
					action: "amend",
					target,
					body: "beta memory",
					longform: "changed document",
				})
			).status,
		).toBe(200);
		expect((await get("/api/search?query=beta")).length).toBe(1);
		expect((await post({ action: "review", target })).status).toBe(200);
		expect(
			(await post({ action: "note", body: "new fact", supersedes: target }))
				.status,
		).toBe(200);
		view = await get();
		expect(view.records[0].state).toBe("hidden");
		const next = `user:notes#${view.records[1].pos}`;
		expect((await post({ action: "forget", target: next })).status).toBe(200);
		expect((await post({ action: "delete", target: next })).status).toBe(403);
		expect(
			(await post({ action: "delete", target: next, confirm: true })).status,
		).toBe(200);
		view = await get();
		expect(view.records[1].body).toBe("");
		expect(view.records[1].content_cleared).toBe(true);
	});

	it("rejects foreign origins, invalid JSON, unlisted profiles, and disabled deletion", async () => {
		const { host, post } = await fixture(backend);
		expect(
			(
				await fetch(`${host.url}/api/view`, {
					headers: { origin: "https://foreign.invalid" },
				})
			).status,
		).toBe(403);
		expect(
			(
				await fetch(
					`${host.url}/api/action?action=note&body=wrong&scope=user:notes`,
				)
			).status,
		).toBe(405);
		expect(
			(await fetch(`${host.url}/api/action`, { method: "POST", body: "{}" }))
				.status,
		).toBe(400);
		expect((await fetch(`${host.url}/api/view?profile=missing`)).status).toBe(
			422,
		);
		expect(
			(await post({ action: "delete", target: "0", confirm: true })).status,
		).toBe(403);
	});

	it("narrows the review lists of a view by the scope and the kind", async () => {
		const { host, get, post } = await fixture(backend);
		await post({ action: "note", body: "task here", kind: "task" });
		await post({ action: "note", body: "fact here", kind: "fact" });
		await post({
			action: "note",
			body: "task there",
			kind: "task",
			scope: "user:other",
		});
		const view = await get("/api/view?scope=user:notes");
		expect(
			view.reviewNext.map((record: { body: string }) => record.body),
		).toEqual(["task here", "fact here"]);
		expect(view.reviewNextTotal).toBe(2);
		const task = await get("/api/view?scope=user:notes&kind=task");
		expect(task.reviewNext).toHaveLength(1);
		expect(task.reviewNextTotal).toBe(1);
		expect((await fetch(`${host.url}/api/view?kind=wrong`)).status).toBe(400);
	});

	it("gives the two lines below one catalog range", async () => {
		const { host, get, post } = await fixture(backend);
		await post({ action: "note", body: "alpha memory" });
		await post({ action: "note", body: "beta memory", scope: "user:other" });
		const lines = await get("/api/catalog?start=0&level=1");
		expect(lines.map((line: { kind: string }) => line.kind)).toEqual([
			"temporary",
			"temporary",
		]);
		expect(lines[0].text).toContain("alpha memory");
		expect(lines[1].text).toContain("beta memory");
		expect(
			(await fetch(`${host.url}/api/catalog?start=0&level=0`)).status,
		).toBe(400);
	});

	it("publishes proposal approval and dismissal together", async () => {
		const { root, env, get, post } = await fixture(backend);
		const runtime = await openRuntime({
			storeFlag: join(root, "store"),
			env,
		});
		try {
			propose(runtime.store, {
				scope: "other:demo",
				op: "note",
				payload: { body: "suggestion", kind: "note" },
			});
		} finally {
			await runtime.close();
		}
		const proposal = (await get()).proposals[0];
		expect((await post({ action: "accept", target: proposal.id })).status).toBe(
			200,
		);
		const view = await get();
		expect(view.proposals).toHaveLength(0);
		expect(view.records[0].body).toBe("suggestion");
		expect((await post({ action: "accept", target: proposal.id })).status).toBe(
			422,
		);
	});

	it("approves a duplicate note through ordinary write rules", async () => {
		const { root, env, get, post } = await fixture(backend);
		const runtime = await openRuntime({
			storeFlag: join(root, "store"),
			env,
		});
		try {
			note(runtime.store, {
				scope: "user:notes",
				body: "same note",
				kind: "note",
				ts: "2026-11-10T00:00:00.000Z",
				review_at: null,
				session: "child",
				turn: "1",
				preset: "test",
			});
			propose(runtime.store, {
				scope: "user:notes",
				op: "note",
				payload: { body: "same note", kind: "note" },
			});
		} finally {
			await runtime.close();
		}
		const proposal = (await get()).proposals[0];
		const responses = await Promise.all([
			post({ action: "accept", target: proposal.id }),
			post({ action: "accept", target: proposal.id }),
		]);
		expect(responses.map((response) => response.status).sort()).toEqual([
			200, 422,
		]);
		const view = await get();
		expect(view.records).toHaveLength(1);
		expect(view.proposals).toHaveLength(0);
	});

	it("moves a note to another listed scope on amend", async () => {
		const { get, post } = await fixture(
			backend,
			false,
			'["user:*", "project:*"]',
		);
		await post({ action: "note", body: "movable", kind: "fact" });
		const before = await get();
		const target = `user:notes#${before.records[0].pos}`;
		expect(
			(
				await post({
					action: "amend",
					target,
					dest: "project:demo",
					body: "moved",
					longform: "",
				})
			).status,
		).toBe(200);
		const after = await get(
			`/api/view?profile=default&scope=${encodeURIComponent("project:demo")}`,
		);
		expect(
			after.records.map((record: { body: string }) => record.body),
		).toEqual(["moved"]);
	});

	it("changes the kind and the supersedes of a note from the console", async () => {
		const { get, post } = await fixture(backend);
		await post({ action: "note", body: "first", kind: "note" });
		await post({ action: "note", body: "second", kind: "note" });
		const before = await get();
		const first = `user:notes#${before.records[0].pos}`;
		const second = `user:notes#${before.records[1].pos}`;
		expect(
			(
				await post({
					action: "amend",
					target: first,
					dest: "user:notes",
					body: "first",
					longform: "",
					kind: "decision",
				})
			).status,
		).toBe(200);
		let view = await get();
		expect(
			view.records.find((record: { body: string }) => record.body === "first")
				?.kind,
		).toBe("decision");
		expect(
			(
				await post({
					action: "amend",
					target: second,
					dest: "user:notes",
					body: "second",
					longform: "",
					kind: "note",
					supersedes: "0",
				})
			).status,
		).toBe(200);
		view = await get();
		const replaced = view.records.find(
			(record: { body: string }) => record.body === "first",
		);
		const source = view.records.find(
			(record: { body: string }) => record.body === "second",
		);
		expect(replaced.state).toBe("hidden");
		expect(replaced.superseded_by).toBe(source.id);
		expect(source.supersedes).toEqual([replaced.id]);
	});

	it("shows a proposal of an unlisted scope and accepts it", async () => {
		const { root, env, get, post } = await fixture(
			backend,
			false,
			'["user:*"]',
		);
		const runtime = await openRuntime({
			storeFlag: join(root, "store"),
			env,
		});
		try {
			propose(runtime.store, {
				scope: "other:demo",
				op: "note",
				payload: { body: "child idea", kind: "note" },
			});
		} finally {
			await runtime.close();
		}
		const view = await get();
		expect(view.proposals).toHaveLength(1);
		expect(
			(await post({ action: "accept", target: view.proposals[0].id })).status,
		).toBe(200);
		expect((await get()).proposals).toHaveLength(0);
		const opened = await openRuntime({
			storeFlag: join(root, "store"),
			env,
		});
		try {
			expect(
				scopeNotes(opened.store, "other:demo").map((record) => record.body),
			).toContain("child idea");
		} finally {
			await opened.close();
		}
	});

	it("states a compaction job without a merge input", async () => {
		const { post } = await fixture(backend);
		await post({ action: "note", body: "alone", kind: "fact" });
		const job = await (await post({ action: "compact" })).json();
		expect(job.inputs).toEqual([]);
		expect(job.job).toBe("");
	});

	it("refuses catalog compaction because the catalog is derived", async () => {
		const { post } = await fixture(backend);
		for (const scope of ["project:a", "project:b"]) {
			await post({
				action: "note",
				scope,
				body: `${scope} ${"detail ".repeat(80)}`,
			});
			await post({ action: "compact", scope });
		}
		const answer = await post({ action: "compact", catalog: true });
		expect(answer.status).toBe(400);
		expect((await answer.json()).error).toContain("catalog is derived");
	});

	it("accepts large copied jobs and rejects bodies above the host limit", async () => {
		const { root, env, post } = await fixture(backend);
		const runtime = await openRuntime({
			storeFlag: join(root, "store"),
			env,
		});
		try {
			for (let index = 0; index < 64; index++)
				note(runtime.store, {
					scope: "user:notes",
					body: `${index} ${"ж".repeat(500)}`,
					longform: "д".repeat(1024),
					kind: "note",
					ts: `2026-11-10T00:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`,
					review_at: null,
					session: "s",
					turn: "t",
					preset: "p",
				});
		} finally {
			await runtime.close();
		}
		const job = await (await post({ action: "compact" })).json();
		expect(Buffer.byteLength(JSON.stringify(job.inputs))).toBeGreaterThan(
			96 * 1024,
		);
		expect(
			await (
				await post({
					action: "compact-answer",
					inputs: job.inputs,
					answers: "#0-1: summary",
				})
			).json(),
		).toEqual({ built: 1, rejected: 0, rejectedRanges: [] });
		expect(
			(await post({ action: "note", body: "x".repeat(2 * 1024 * 1024) }))
				.status,
		).toBe(400);
	});

	it("rejects stale compaction answers after an amendment", async () => {
		const { get, post } = await fixture(backend);
		await post({ action: "note", body: `first ${"detail ".repeat(90)}` });
		await post({ action: "note", body: `second ${"detail ".repeat(90)}` });
		const job = await (await post({ action: "compact" })).json();
		expect(job.inputs).toHaveLength(1);
		await post({
			action: "amend",
			target: "0",
			body: `changed ${"detail ".repeat(80)}`,
			longform: "",
		});
		const stale = await (
			await post({
				action: "compact-answer",
				inputs: job.inputs,
				answers: "#0-1: old summary",
			})
		).json();
		expect(stale).toEqual({
			built: 0,
			rejected: 1,
			rejectedRanges: ["#0-1"],
		});
		const fresh = await (await post({ action: "compact" })).json();
		const applied = await (
			await post({
				action: "compact-answer",
				inputs: fresh.inputs,
				answers: "#0-1: fresh summary",
			})
		).json();
		expect(applied).toEqual({ built: 1, rejected: 0, rejectedRanges: [] });
		expect(
			(await get()).nodes.some((entry: { clean: boolean }) => entry.clean),
		).toBe(true);
	});
});
