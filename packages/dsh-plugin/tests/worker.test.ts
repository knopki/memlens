/**
 * #region moduleContract
 * @purpose Prove the worker triggers, the model route, the retry pacing, and the disposal.
 * @scope The dirty threshold, the idle timer, the retry timer, the rate limit, and disposal.
 * @invariants Tests use a real store, a controlled LLM stub, and fake time. No test makes a paid call.
 * #endregion moduleContract
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import {
	type CompactionConfig,
	candidates,
	note,
	Store,
	type StoreConfig,
} from "@memlens/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryWorker, type WorkerLlm } from "../src/worker.js";

/** A controlled LLM that records the route and gives the scripted answer text. */
class StubLlm implements WorkerLlm {
	readonly log: GenerateOptions[] = [];
	answer = "one line summary";
	fail = false;

	stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
		this.log.push(options);
		const answer = this.answer;
		const fail = this.fail;
		return (async function* (): AsyncGenerator<StreamChunk> {
			if (fail) throw new Error("stub refusal");
			yield { type: "text-delta", index: 0, text: answer };
			yield { type: "finish", reason: { kind: "stop" } };
		})();
	}
}

/** The resolved worker inputs with plain values. */
function inputs(part: Partial<CompactionConfig> = {}): {
	compaction: CompactionConfig;
	store: StoreConfig;
	cacheTtl: Record<string, number>;
} {
	return {
		compaction: {
			provider: "test",
			model: "merge-model",
			effort: "",
			mode: "parallel",
			batch: 1,
			maxCallsPerHour: 60,
			...part,
		},
		store: { path: "unused", idle: 300 },
		cacheTtl: {},
	};
}

/** One store with two long notes, so one dirty merge range waits for the model. */
function dirtyStore(): Store {
	const directory = mkdtempSync(join(tmpdir(), "memlens-worker-"));
	const store = new Store(directory);
	for (const index of [0, 1]) {
		note(store, {
			scope: "user:notes",
			kind: "note",
			body: `${"long body ".repeat(40)}${index}`,
			session: "session-1",
			turn: "turn-1",
			preset: "default",
			ts: `2026-01-0${index + 1}T00:00:00.000Z`,
		});
	}
	return store;
}

const roots: Context[] = [];

const stores: Store[] = [];

afterEach(() => {
	vi.useRealTimers();
	for (const root of roots.splice(0)) void root.fiber.dispose();
	for (const store of stores.splice(0)) store.close();
});

describe("MemoryWorker", () => {
	it("starts a pass at the dirty threshold and uses the configured route", async () => {
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		const worker = new MemoryWorker(root, store, inputs(), llm);
		await flush();
		expect(llm.log).toHaveLength(0);
		worker.onMemoryTool("memory_note");
		await vi.waitFor(() => expect(llm.log.length).toBeGreaterThan(0));
		expect(llm.log[0]?.provider).toBe("test");
		expect(llm.log[0]?.model).toBe("merge-model");
		await vi.waitFor(() =>
			expect(candidates(store, "user:notes")).toHaveLength(0),
		);
	});

	it("starts a pass at the idle limit through fake time", async () => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		new MemoryWorker(root, store, inputs({ batch: 2 }), llm);
		await vi.advanceTimersByTimeAsync(299_000);
		expect(llm.log).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(llm.log.length).toBeGreaterThan(0);
	});

	it("schedules one retry after a failed pass", async () => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		llm.fail = true;
		const worker = new MemoryWorker(root, store, inputs(), llm);
		worker.onMemoryTool("memory_note");
		await vi.advanceTimersByTimeAsync(0);
		const failedCalls = llm.log.length;
		expect(failedCalls).toBeGreaterThan(0);
		expect(candidates(store, "user:notes")).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(llm.log.length).toBeGreaterThan(failedCalls);
	});

	it("keeps the range dirty when the rate limit denies each call", async () => {
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		const worker = new MemoryWorker(
			root,
			store,
			inputs({ maxCallsPerHour: 0 }),
			llm,
		);
		worker.onMemoryTool("memory_note");
		await flush();
		expect(llm.log).toHaveLength(0);
		expect(candidates(store, "user:notes")).toHaveLength(1);
	});

	it("starts no pass and no timer after disposal", async () => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const llm = new StubLlm();
		const root = new Context();
		const worker = new MemoryWorker(root, store, inputs(), llm);
		await root.fiber.dispose();
		roots.splice(roots.indexOf(root), 1);
		await vi.advanceTimersByTimeAsync(600_000);
		worker.onMemoryTool("memory_note");
		await vi.advanceTimersByTimeAsync(0);
		expect(llm.log).toHaveLength(0);
	});
});

/** Give the event loop one turn, so an async pass settles before a check. */
async function flush(): Promise<void> {
	for (let index = 0; index < 8; index += 1)
		await new Promise((resolve) => setImmediate(resolve));
}
