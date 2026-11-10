/**
 * #region moduleContract
 * @purpose Verify durable storage through the same port suite and real process failures.
 * @scope Both backends, exact build inputs, replay recovery, and publication boundaries. No search index.
 * @invariants A failed write leaves the prior state. A published write survives process death.
 * #endregion moduleContract
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
	appendFile,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { project, scopeTree } from "../src/domain/projection.js";
import { buildInput, rev } from "../src/domain/tree.js";
import { JsonlStore } from "../src/storage/jsonl.js";
import { encodeProjection } from "../src/storage/publication.js";
import { SqliteStore } from "../src/storage/sqlite.js";
import type { JsonlLine, NodeEvent } from "../src/types/events.js";
import type { AppendEvent, StorePort } from "../src/types/store.js";
import type { BuildInput } from "../src/types/tree.js";

const core = fileURLToPath(new URL("../", import.meta.url));
const fixture = fileURLToPath(
	new URL("./fixtures/storage-child.mjs", import.meta.url),
);
const timestamp = "2026-11-10T00:00:00.000Z";
const directories: string[] = [];
const stores: StorePort[] = [];
const payload = (body = "body"): Extract<AppendEvent, { op: "note" }> => ({
	op: "note",
	scope: "project:a",
	body,
	kind: "note",
	ts: timestamp,
	review_at: null,
	session: "s",
	turn: "t",
	preset: "p",
});

// #region FUNC_child
/** @purpose Start a real writer and preserve its exit status and diagnostic output. */
function child(
	backend: string,
	directory: string,
	action: string,
	marker = "",
) {
	const process = spawn(
		globalThis.process.execPath,
		[fixture, backend, directory, action, marker],
		{
			env: { ...globalThis.process.env, NODE_DEBUG: `memlens:${backend}` },
			stdio: ["ignore", "pipe", "pipe", "ipc"],
		},
	);
	const deadline = setTimeout(() => process.kill("SIGKILL"), 10_000);
	deadline.unref();
	process.once("close", () => clearTimeout(deadline));
	let stderr = "";
	let stdout = "";
	process.stderr.on("data", (data) => {
		stderr += data;
	});
	process.stdout.on("data", (data) => {
		stdout += data;
	});
	const ready = new Promise<void>((resolve, reject) => {
		process.once("message", () => resolve());
		process.once("error", reject);
		process.once("exit", () =>
			reject(new Error(`Child exited before ready: ${stderr}`)),
		);
	});
	const result = new Promise<{
		code: number | null;
		signal: string | null;
		stderr: string;
		stdout: string;
	}>((resolve, reject) => {
		process.once("error", reject);
		process.once("close", (code, signal) =>
			resolve({ code, signal, stderr, stdout }),
		);
	});
	return { process, ready, result };
}
// #endregion FUNC_child

beforeAll(async () => {
	const build = spawn("pnpm", ["run", "build"], { cwd: core, stdio: "pipe" });
	let output = "";
	build.stdout.on("data", (data) => {
		output += data;
	});
	build.stderr.on("data", (data) => {
		output += data;
	});
	const code = await new Promise((resolve, reject) => {
		build.once("error", reject);
		build.once("close", resolve);
	});
	expect(code, output).toBe(0);
}, 30_000);

afterEach(async () => {
	await Promise.all(stores.splice(0).map((store) => store.close()));
	await Promise.all(
		directories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

// #region FUNC_summary
/** @purpose Copy the exact model input and construct its matching summary event. */
async function summary(
	store: StorePort,
): Promise<{ input: BuildInput; event: Omit<NodeEvent, "id" | "at"> }> {
	const tree = scopeTree(await store.projection(), "project:a");
	const range = { start: 0, level: 1 };
	const input = buildInput(tree, range);
	if (!input) throw new Error("Fixture needs ready children");
	const revisions = [
		rev(tree, { start: 0, level: 0 }),
		rev(tree, { start: 1, level: 0 }),
	];
	return {
		input,
		event: {
			op: "node",
			scope: "project:a",
			...range,
			child_a: input.children[0]?.id ?? null,
			child_b: input.children[1]?.id ?? null,
			input_rev:
				revisions
					.filter((value) => value !== null)
					.sort()
					.at(-1) ?? null,
			summary: "PRIVATE_SUMMARY",
			chars: 15,
			truncated: false,
			ts_from: timestamp,
			ts_to: timestamp,
		},
	};
}
// #endregion FUNC_summary

for (const [backend, Store, filename] of [
	["sqlite", SqliteStore, "memlens.db"],
	["jsonl", JsonlStore, "memlens.jsonl"],
] as const) {
	describe(`${Store.name} durable port`, () => {
		let directory: string;
		const open = () => {
			const store: StorePort = new Store(directory);
			stores.push(store);
			return store;
		};
		const setup = async () => {
			directory = await mkdtemp(join(tmpdir(), `memlens-${backend}-`));
			directories.push(directory);
			return open();
		};

		it("normalizes, deduplicates without revision change, and reopens the persisted projection", async () => {
			let store = await setup();
			const emptyRev = await store.rev();
			if (backend === "sqlite") expect(emptyRev).toBe("0");
			const first = await store.append({
				...payload("  durable   note  "),
				scope: "Project:A",
			});
			expect(first).toMatchObject({
				body: "durable note",
				scope: "project:a",
				id: expect.any(String),
				at: expect.any(String),
			});
			const revision = await store.rev();
			expect(revision).not.toBe(emptyRev);
			if (backend === "sqlite") expect(revision).toBe("1");
			expect(await store.import([])).toBe(0);
			expect(await store.rev()).toBe(revision);
			expect(
				await store.append({ ...payload("durable note"), session: "another" }),
			).toEqual(first);
			expect(await store.rev()).toBe(revision);
			await store.append({ ...payload("other scope"), scope: "project:b" });
			expect(await store.export("project:a")).toEqual([first]);
			expect(await store.export(null)).toHaveLength(2);
			const projection = await store.projection();
			expect(projection.records.get(first.id)).toMatchObject({
				body: "durable note",
				pos: 0,
				state: "live",
			});
			const durableRev = await store.rev();
			await store.close();
			store = open();
			expect(await store.projection()).toEqual(projection);
			expect(await store.rev()).toBe(durableRev);
			expect((await stat(join(directory, filename))).size).toBeGreaterThan(0);
		});

		it("plans a repair in a dry run and rebuilds the index with no source change", async () => {
			const store = await setup();
			await store.append(payload("repair source"));
			const revision = await store.rev();
			const projection = await store.projection();
			const planned = await store.repair(true);
			expect(planned.join("\n")).toContain("index rows");
			expect(await store.projection()).toEqual(projection);
			expect(await store.rev()).toBe(revision);
			const applied = await store.repair(false);
			expect(applied).toEqual(planned);
			expect(await store.projection()).toEqual(projection);
			expect(await store.rev()).toBe(revision);
		});

		it("rolls back invalid append and whole invalid import, then imports once by id union", async () => {
			let store = await setup();
			await store.append(payload());
			const before = await store.export(null);
			const revision = await store.rev();
			const incoming: JsonlLine = {
				...payload("imported"),
				id: "00000000000000000000000001",
				at: timestamp,
			};
			await expect(
				store.append({ ...payload(), body: 42 } as unknown as AppendEvent),
			).rejects.toMatchObject({ code: "Data" });
			await expect(
				store.import([
					incoming,
					{ ...incoming, op: "unknown" } as unknown as JsonlLine,
				]),
			).rejects.toMatchObject({ code: "Data" });
			expect(await store.export(null)).toEqual(before);
			expect(await store.rev()).toBe(revision);
			await store.close();
			store = open();
			expect(await store.export(null)).toEqual(before);
			expect(await store.import([incoming])).toBe(1);
			const importedRev = await store.rev();
			expect(importedRev).not.toBe(revision);
			expect(await store.import([incoming])).toBe(0);
			expect(await store.rev()).toBe(importedRev);
			expect((await store.projection()).records.get(incoming.id)?.body).toBe(
				"imported",
			);
		});

		it("checks exact copied build input and persists import invalidation through restart", async () => {
			let store = await setup();
			const source = await store.append(payload());
			await store.append(payload("second"));
			const { input, event } = await summary(store);
			const revision = await store.rev();
			const child = input.children[0];
			if (child?.kind !== "record") throw new Error("Fixture needs a record");
			for (const change of [
				{ body: "changed" },
				{ preview: "changed" },
				{ ts: "2026-11-11T00:00:00.000Z" },
				{ pos: 1 },
				{ id: "wrong" },
			]) {
				expect(
					await store.appendNode(
						{
							...input,
							children: [{ ...child, ...change }, input.children[1]],
						},
						event,
					),
				).toEqual({ ok: false, reason: "input_changed" });
			}
			expect(
				await store.appendNode({ ...input, children: [null, null] }, event),
			).toEqual({ ok: false, reason: "empty_children" });
			expect(await store.rev()).toBe(revision);
			const built = await store.appendNode(input, event);
			expect(built.ok).toBe(true);
			if (!built.ok) throw new Error("Fixture summary rejected");
			const upper = buildInput(
				scopeTree(await store.projection(), "project:a"),
				{ start: 0, level: 2 },
			);
			const copiedNode = upper?.children[0];
			if (!upper || copiedNode?.kind !== "node")
				throw new Error("Fixture needs a summary child");
			for (const change of [
				{ summary: "changed" },
				{ range: { start: 2, level: 1 } },
				{ ts_from: "2026-11-11T00:00:00.000Z" },
				{ ts_to: "2026-11-11T00:00:00.000Z" },
			]) {
				expect(
					await store.appendNode(
						{
							...upper,
							children: [{ ...copiedNode, ...change }, upper.children[1]],
						},
						{ ...event, level: 2, child_a: built.node.id, child_b: null },
					),
				).toEqual({ ok: false, reason: "input_changed" });
			}
			const amendment: JsonlLine = {
				op: "amend",
				scope: "project:a",
				target: source.id,
				body: "new body",
				id: "7ZZZZZZZZZZZZZZZZZZZZZZZZZ",
				at: "2099-01-01T00:00:00.000Z",
			};
			expect(await store.import([amendment])).toBe(1);
			expect((await store.projection()).invalidated.has(built.node.id)).toBe(
				true,
			);
			expect(
				(await store.export(null)).some(
					(line) =>
						line.op === "invalidate" && line.targets.includes(built.node.id),
				),
			).toBe(true);
			await store.close();
			store = open();
			expect((await store.projection()).invalidated.has(built.node.id)).toBe(
				true,
			);
			expect((await store.projection()).nodes.get("project:a") ?? []).toEqual(
				[],
			);
			const importedRev = await store.rev();
			expect(await store.import([amendment])).toBe(0);
			expect(await store.rev()).toBe(importedRev);
			expect(await store.appendNode(input, event)).toEqual({
				ok: false,
				reason: "input_changed",
			});
		});

		it("clears source and summaries durably and rejects content from a stale import", async () => {
			let store = await setup();
			const source = await store.append({
				...payload("PRIVATE_SOURCE"),
				longform: "PRIVATE_DOCUMENT",
			});
			const { input, event } = await summary(store);
			const built = await store.appendNode(input, event);
			expect(built.ok).toBe(true);
			const stale = await store.export(null);
			const revision = await store.rev();
			await store.append({
				op: "redact",
				scope: "project:a",
				target: source.id,
				reason: "erase",
			});
			expect(await store.rev()).not.toBe(revision);
			for (const name of [
				filename,
				...(backend === "sqlite" ? ["memlens.db-wal"] : []),
			]) {
				const path = join(directory, name);
				if (existsSync(path))
					expect((await readFile(path)).toString("utf8")).not.toMatch(
						/PRIVATE_(SOURCE|DOCUMENT|SUMMARY)/,
					);
			}
			await store.close();
			store = open();
			await store.import(stale);
			await store.close();
			store = open();
			const lines = await store.export(null);
			expect(lines.find((line) => line.id === source.id)).toMatchObject({
				redacted: true,
				body: "",
				longform: null,
			});
			expect(lines.find((line) => line.op === "node")).toMatchObject({
				redacted: true,
				summary: "",
				chars: 0,
			});
			expect(JSON.stringify(lines)).not.toMatch(
				/PRIVATE_(SOURCE|DOCUMENT|SUMMARY)/,
			);
			expect((await store.projection()).records.get(source.id)).toMatchObject({
				body: "",
				longform: null,
				content_cleared: true,
			});
		});

		it("serializes separate writers without lost events or duplicate positions", async () => {
			const store = await setup();
			await store.close();
			const writers = [
				child(backend, directory, "writer-a"),
				child(backend, directory, "writer-b"),
			];
			await Promise.all(writers.map((writer) => writer.ready));
			for (const writer of writers) writer.process.send("start");
			for (const result of await Promise.all(
				writers.map((writer) => writer.result),
			))
				expect(result.code, result.stderr).toBe(0);
			const reopened = open();
			if (backend === "sqlite") expect(await reopened.rev()).toBe("2");
			const records = [...(await reopened.projection()).records.values()];
			expect(records.map((record) => record.body).sort()).toEqual([
				"writer-a",
				"writer-b",
			]);
			expect(records.map((record) => record.pos).sort()).toEqual([0, 1]);
			expect(
				new Set((await reopened.export(null)).map((line) => line.id)).size,
			).toBe(2);
		}, 15_000);

		it.each(["before_publish", "after_publish"])(
			"recovers complete erasure after process death at %s",
			async (marker) => {
				let store = await setup();
				const source = await store.append({
					...payload("PRIVATE_CRASH_SECRET"),
					longform: "PRIVATE_CRASH_DOCUMENT",
				});
				const { input, event } = await summary(store);
				await store.appendNode(input, event);
				await store.close();
				const writer = child(backend, directory, `redact:${source.id}`, marker);
				await writer.ready;
				writer.process.send("start");
				const result = await writer.result;
				expect(result.signal, result.stderr).toBe("SIGKILL");
				store = open();
				const exported = JSON.stringify(await store.export(null));
				if (marker === "before_publish")
					expect(exported).toContain("PRIVATE_CRASH_SECRET");
				else {
					expect(exported).not.toMatch(
						/PRIVATE_(CRASH_SECRET|CRASH_DOCUMENT|SUMMARY)/,
					);
					for (const name of [
						filename,
						...(backend === "sqlite" ? ["memlens.db-wal"] : ["index.db"]),
					]) {
						const path = join(directory, name);
						if (existsSync(path))
							expect((await readFile(path)).toString("utf8")).not.toMatch(
								/PRIVATE_(CRASH_SECRET|CRASH_DOCUMENT|SUMMARY)/,
							);
					}
				}
			},
			15_000,
		);

		it.each(["before_publish", "after_publish"])(
			"recovers an atomic state after death at %s",
			async (marker) => {
				const store = await setup();
				await store.append(payload("baseline"));
				const revision = await store.rev();
				await store.close();
				const writer = child(backend, directory, "crash-write", marker);
				await writer.ready;
				writer.process.send("start");
				const result = await writer.result;
				expect(result.stderr).toContain(marker);
				expect(result.signal, result.stderr).toBe("SIGKILL");
				const reopened = open();
				const bodies = [...(await reopened.projection()).records.values()]
					.map((record) => record.body)
					.sort();
				expect(bodies).toEqual(
					marker === "before_publish"
						? ["baseline"]
						: ["baseline", "crash-write"],
				);
				const nextRev = await reopened.rev();
				if (marker === "before_publish") expect(nextRev).toBe(revision);
				else expect(nextRev).not.toBe(revision);
				await reopened.append(payload("after recovery"));
				expect(
					(await reopened.export(null)).filter((line) => line.op === "note"),
				).toHaveLength(bodies.length + 1);
			},
			15_000,
		);
	});
}

describe("JSONL recovery", () => {
	it.each(["kept", "removed", "corrupt"])(
		"persists old external amendment invalidation with a %s sidecar",
		async (sidecarState) => {
			const directory = await mkdtemp(
				join(tmpdir(), "memlens-jsonl-external-"),
			);
			directories.push(directory);
			let store = new JsonlStore(directory);
			stores.push(store);
			const source = await store.append(payload("original"));
			const { input, event } = await summary(store);
			const built = await store.appendNode(input, event);
			if (!built.ok) throw new Error("Fixture summary rejected");
			const inputRev = event.input_rev;
			const amendment: JsonlLine = {
				op: "amend",
				scope: "project:a",
				target: source.id,
				body: "external amendment",
				id: "00000000000000000000000002",
				at: "2000-01-01T00:00:00.000Z",
			};
			await store.close();
			const path = join(directory, "memlens.jsonl");
			await appendFile(
				path,
				`${JSON.stringify(amendment)}\n{"op":"unfinished"`,
			);
			const sidecar = join(directory, "index.db");
			if (sidecarState === "removed") await rm(sidecar);
			else if (sidecarState === "corrupt")
				await writeFile(sidecar, "not a database");
			store = new JsonlStore(directory);
			stores.push(store);
			const recovered = await store.projection();
			expect(recovered.records.get(source.id)?.body).toBe("external amendment");
			expect(
				rev(scopeTree(recovered, "project:a"), { start: 0, level: 0 }),
			).toBe(inputRev);
			expect(recovered.invalidated.has(built.node.id)).toBe(true);
			expect(recovered.nodes.get("project:a") ?? []).toEqual([]);
			expect(
				(await store.export(null)).some(
					(line) =>
						line.op === "invalidate" && line.targets.includes(built.node.id),
				),
			).toBe(true);
			await store.close();
			store = new JsonlStore(directory);
			stores.push(store);
			expect((await store.projection()).invalidated.has(built.node.id)).toBe(
				true,
			);
			expect((await store.projection()).records.size).toBe(1);
		},
	);

	it("sanitizes an external redact in the source before reads or exports return", async () => {
		const directory = await mkdtemp(
			join(tmpdir(), "memlens-jsonl-external-redact-"),
		);
		directories.push(directory);
		let store = new JsonlStore(directory);
		stores.push(store);
		const source = await store.append({
			...payload("PRIVATE_EXTERNAL_SOURCE"),
			longform: "PRIVATE_EXTERNAL_DOCUMENT",
		});
		const { input, event } = await summary(store);
		const built = await store.appendNode(input, event);
		if (!built.ok) throw new Error("Fixture summary rejected");
		await store.close();
		const path = join(directory, "memlens.jsonl");
		const redact: JsonlLine = {
			op: "redact",
			scope: "project:a",
			target: source.id,
			reason: "erase",
			id: "00000000000000000000000003",
			at: timestamp,
		};
		await appendFile(path, `${JSON.stringify(redact)}\n`);
		store = new JsonlStore(directory);
		stores.push(store);
		expect((await store.projection()).records.get(source.id)).toMatchObject({
			body: "",
			longform: null,
			content_cleared: true,
		});
		const durable = await readFile(path, "utf8");
		expect(durable).not.toMatch(
			/PRIVATE_(EXTERNAL_SOURCE|EXTERNAL_DOCUMENT|SUMMARY)/,
		);
		const exported = await store.export(null);
		expect(exported.find((line) => line.id === source.id)).toMatchObject({
			body: "",
			longform: null,
			redacted: true,
		});
		expect(exported.find((line) => line.id === built.node.id)).toMatchObject({
			summary: "",
			chars: 0,
			redacted: true,
		});
		await store.close();
		store = new JsonlStore(directory);
		stores.push(store);
		expect(await store.export(null)).toEqual(exported);
	});

	it("ignores a partial tail, repairs it before a write, and tracks byte offsets", async () => {
		const directory = await mkdtemp(join(tmpdir(), "memlens-jsonl-tail-"));
		directories.push(directory);
		let store = new JsonlStore(directory);
		stores.push(store);
		await store.append(payload("Юникод 🐎"));
		await store.close();
		const path = join(directory, "memlens.jsonl");
		const complete = await readFile(path);
		await appendFile(path, '{"op":"note","body":"unfinished');
		store = new JsonlStore(directory);
		stores.push(store);
		expect((await store.projection()).records.size).toBe(1);
		expect((await store.projection()).cursor).toBe(complete.length);
		await store.append(payload("after tail"));
		const bytes = await readFile(path);
		const lines = bytes
			.toString("utf8")
			.trimEnd()
			.split("\n")
			.map((line) => JSON.parse(line));
		expect(lines.map((line) => line.body)).toEqual(["Юникод 🐎", "after tail"]);
		expect((await store.projection()).cursor).toBe(bytes.length);
	});

	it.each(["removed", "corrupt"])(
		"rebuilds a %s sidecar from the authoritative log",
		async (damage) => {
			const directory = await mkdtemp(join(tmpdir(), "memlens-jsonl-index-"));
			directories.push(directory);
			let store = new JsonlStore(directory);
			stores.push(store);
			await store.append(payload("Юникод 🐎"));
			const expected = await store.projection();
			const revision = await store.rev();
			await store.close();
			const sidecar = join(directory, "index.db");
			if (damage === "removed") await rm(sidecar);
			else await writeFile(sidecar, "not a database");
			store = new JsonlStore(directory);
			stores.push(store);
			expect(await store.projection()).toEqual(expected);
			expect(await store.rev()).toBe(revision);
			expect((await store.projection()).cursor).toBe(
				(await stat(join(directory, "memlens.jsonl"))).size,
			);
			expect((await stat(sidecar)).size).toBeGreaterThan(0);
		},
	);
});

describe("store repair", () => {
	it("truncates an incomplete jsonl tail and rebuilds the sidecar", async () => {
		const directory = await mkdtemp(join(tmpdir(), "memlens-jsonl-repair-"));
		directories.push(directory);
		let store = new JsonlStore(directory);
		stores.push(store);
		await store.append(payload("tail source"));
		await store.close();
		const path = join(directory, "memlens.jsonl");
		const complete = await readFile(path, "utf8");
		await appendFile(path, '{"op":"unfinished"');
		store = new JsonlStore(directory);
		stores.push(store);
		const planned = await store.repair(true);
		expect(planned.join("\n")).toContain("incomplete tail bytes");
		expect(await readFile(path, "utf8")).toBe(`${complete}{"op":"unfinished"`);
		const applied = await store.repair(false);
		expect(applied).toEqual(planned);
		expect(await readFile(path, "utf8")).toBe(complete);
		expect((await store.projection()).records.size).toBe(1);
	});

	it("rewrites a drifted sqlite projection row from the log", async () => {
		const directory = await mkdtemp(join(tmpdir(), "memlens-sqlite-repair-"));
		directories.push(directory);
		let store = new SqliteStore(directory);
		stores.push(store);
		await store.append(payload("drift source"));
		const revision = await store.rev();
		await store.close();
		const db = new DatabaseSync(join(directory, "memlens.db"));
		db.exec("PRAGMA busy_timeout = 5000");
		db.prepare("UPDATE state SET projection = ? WHERE id = 1").run(
			encodeProjection(project([])),
		);
		db.close();
		store = new SqliteStore(directory);
		stores.push(store);
		expect((await store.projection()).records.size).toBe(0);
		const planned = await store.repair(true);
		expect(planned.join("\n")).toContain("rewrite the projection from the log");
		expect((await store.projection()).records.size).toBe(0);
		const applied = await store.repair(false);
		expect(applied).toEqual(planned);
		expect((await store.projection()).records.size).toBe(1);
		expect(await store.rev()).not.toBe(revision);
	});
});
