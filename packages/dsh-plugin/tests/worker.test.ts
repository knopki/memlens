/**
 * #region moduleContract
 * @purpose Prove the worker triggers, the model route, the retry pacing, the inputs update, and
 *  the disposal.
 * @scope The dirty threshold, the idle timer, the retry timer, the rate limit, the route snapshot,
 *  and disposal.
 * @invariants Tests use a real store, a controlled LLM stub, and fake time. No test makes a paid call.
 * #endregion moduleContract
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import type { GenerateOptions, StreamChunk } from "@deepseek-ai/dsh-llm";
import {
	type CompactionConfig,
	candidates,
	note,
	type ScopeKey,
	Store,
} from "@memlens/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	MemoryWorker,
	type WorkerInputs,
	type WorkerLlm,
} from "../src/worker.js";

/** A controlled LLM that records the route and gives the scripted answer text. */
class StubLlm implements WorkerLlm {
	readonly log: GenerateOptions[] = [];
	answer = "one line summary";
	fail = false;
	onStream: ((options: GenerateOptions) => void) | null = null;

	stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
		this.log.push(options);
		this.onStream?.(options);
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
function inputs(
	part: Partial<CompactionConfig> = {},
	idle = 300,
): WorkerInputs {
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
		store: { path: "unused", idle },
		cacheTtl: {},
	};
}

/** The scopes of the two long notes of one store, so one dirty range waits per scope. */
const SCOPES: readonly ScopeKey[] = ["user:a", "user:b"];

/** One store with two long notes in each named scope, so one merge range waits per scope. */
function dirtyStore(scopes: readonly ScopeKey[] = ["user:notes"]): Store {
	const directory = mkdtempSync(join(tmpdir(), "memlens-worker-"));
	const store = new Store(directory);
	for (const scope of scopes) addNotes(store, scope);
	return store;
}

/** Add two long notes of one scope to a live store. */
function addNotes(store: Store, scope: ScopeKey = "user:notes"): void {
	for (const index of [0, 1]) {
		note(store, {
			scope,
			kind: "note",
			body: `${"long body ".repeat(40)}${index}`,
			session: "session-1",
			turn: "turn-1",
			preset: "default",
			ts: `2026-01-0${index + 1}T00:00:00.000Z`,
		});
	}
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

	it("starts a pass ten seconds after activation when work waits", async () => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		new MemoryWorker(root, store, inputs({ batch: 2 }), llm);
		await vi.advanceTimersByTimeAsync(9_000);
		expect(llm.log).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(llm.log.length).toBeGreaterThan(0);
	});

	it("starts a pass at the idle limit through fake time", async () => {
		vi.useFakeTimers();
		const store = new Store(mkdtempSync(join(tmpdir(), "memlens-worker-")));
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		new MemoryWorker(root, store, inputs({ batch: 2 }), llm);
		await vi.advanceTimersByTimeAsync(10_000);
		addNotes(store);
		await vi.advanceTimersByTimeAsync(289_000);
		expect(llm.log).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(llm.log.length).toBeGreaterThan(0);
	});

	it("states the route, the times, and the last error of the status", async () => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		llm.fail = true;
		const worker = new MemoryWorker(root, store, inputs(), llm);
		const before = worker.status();
		expect(before.provider).toBe("test");
		expect(before.model).toBe("merge-model");
		expect(before.lastRunAt).toBeNull();
		expect(before.lastError).toBeNull();
		expect(before.nextRunAt).not.toBeNull();
		worker.onMemoryTool("memory_note");
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(0);
		expect(worker.status().attempts).toBe(1);
		expect(worker.status().lastRunAt).not.toBeNull();
		expect(worker.status().lastError).toContain("stub refusal");
		const failedKinds = worker.status().events.map((entry) => entry.kind);
		expect(failedKinds).toContain("error");
		expect(failedKinds).toContain("retry");
		llm.fail = false;
		await vi.advanceTimersByTimeAsync(10_000);
		await vi.advanceTimersByTimeAsync(0);
		expect(worker.status().lastError).toBeNull();
		const events = worker.status().events;
		expect(events.length).toBeLessThanOrEqual(10);
		expect(events[events.length - 1]?.kind).toBe("pass");
		expect(events[events.length - 1]?.text).toContain("built");
	});

	it("states the rejection reasons of failed merge answers", async () => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		llm.answer = "x".repeat(1000);
		const worker = new MemoryWorker(root, store, inputs(), llm);
		worker.onMemoryTool("memory_note");
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(0);
		const status = worker.status();
		expect(status.attempts).toBe(1);
		expect(status.lastError).toContain("not_shorter");
		const failedEntry = status.events.find((entry) => entry.kind === "error");
		expect(failedEntry?.text).toContain("not_shorter");
		expect(status.events[status.events.length - 1]?.kind).toBe("retry");
	});

	it("waits one full idle time after an empty idle check", async () => {
		vi.useFakeTimers();
		const store = new Store(mkdtempSync(join(tmpdir(), "memlens-worker-")));
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		const worker = new MemoryWorker(root, store, inputs(), llm);
		await vi.advanceTimersByTimeAsync(301_000);
		expect(worker.status().attempts).toBe(0);
		const next = worker.status().nextRunAt;
		expect(next).not.toBeNull();
		expect(Date.parse(next ?? "") - Date.now()).toBeGreaterThanOrEqual(290_000);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(worker.status().attempts).toBe(0);
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

	it("applies a new threshold to the next tool call", async () => {
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		const worker = new MemoryWorker(root, store, inputs({ batch: 2 }), llm);
		worker.onMemoryTool("memory_note");
		await flush();
		expect(llm.log).toHaveLength(0);
		worker.updateInputs(inputs({ batch: 1 }));
		worker.onMemoryTool("memory_note");
		await vi.waitFor(() => expect(llm.log.length).toBeGreaterThan(0));
		expect(llm.log[0]?.model).toBe("merge-model");
	});

	it("keeps the route of the running pass when the inputs change", async () => {
		const store = dirtyStore(SCOPES);
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		const worker = new MemoryWorker(root, store, inputs(), llm);
		llm.onStream = () => {
			worker.updateInputs(inputs({ model: "next-model" }));
		};
		worker.onMemoryTool("memory_note");
		await vi.waitFor(() => expect(llm.log).toHaveLength(2));
		expect(llm.log.map((options) => options.model)).toEqual([
			"merge-model",
			"merge-model",
		]);
	});

	it("keeps the calls of the hour when the limit and the route change", async () => {
		vi.useFakeTimers();
		const store = dirtyStore(SCOPES);
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		const worker = new MemoryWorker(
			root,
			store,
			inputs({ maxCallsPerHour: 1 }),
			llm,
		);
		worker.onMemoryTool("memory_note");
		await vi.advanceTimersByTimeAsync(0);
		expect(llm.log).toHaveLength(1);
		expect(candidates(store, "user:a")).toHaveLength(0);
		expect(candidates(store, "user:b")).toHaveLength(1);
		worker.updateInputs(inputs({ maxCallsPerHour: 1 }));
		await vi.advanceTimersByTimeAsync(10_000);
		expect(llm.log).toHaveLength(1);
		worker.updateInputs(inputs({ maxCallsPerHour: 2, model: "next-model" }));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(llm.log).toHaveLength(2);
		expect(llm.log[1]?.model).toBe("next-model");
		expect(candidates(store, "user:b")).toHaveLength(0);
	});

	it("keeps the call limit of the running pass when the inputs change", async () => {
		const store = dirtyStore(SCOPES);
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		const worker = new MemoryWorker(
			root,
			store,
			inputs({ maxCallsPerHour: 2 }),
			llm,
		);
		llm.onStream = () => {
			worker.updateInputs(inputs({ maxCallsPerHour: 0 }));
		};
		worker.onMemoryTool("memory_note");
		await vi.waitFor(() => expect(llm.log).toHaveLength(2));
		expect(candidates(store, "user:b")).toHaveLength(0);
	});

	it("re-arms the idle timer when the idle time falls", async () => {
		vi.useFakeTimers();
		const store = new Store(mkdtempSync(join(tmpdir(), "memlens-worker-")));
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		const worker = new MemoryWorker(
			root,
			store,
			inputs({ batch: 2 }, 600),
			llm,
		);
		await vi.advanceTimersByTimeAsync(10_000);
		addNotes(store);
		await vi.advanceTimersByTimeAsync(289_000);
		expect(llm.log).toHaveLength(0);
		worker.updateInputs(inputs({ batch: 2 }, 300));
		await vi.advanceTimersByTimeAsync(2_000);
		expect(llm.log.length).toBeGreaterThan(0);
	});

	it("defers the idle pass when the idle time rises", async () => {
		vi.useFakeTimers();
		const store = new Store(mkdtempSync(join(tmpdir(), "memlens-worker-")));
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		const worker = new MemoryWorker(root, store, inputs({ batch: 2 }), llm);
		await vi.advanceTimersByTimeAsync(10_000);
		addNotes(store);
		await vi.advanceTimersByTimeAsync(289_000);
		worker.updateInputs(inputs({ batch: 2 }, 600));
		await vi.advanceTimersByTimeAsync(299_000);
		expect(llm.log).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(3_000);
		expect(llm.log.length).toBeGreaterThan(0);
	});

	it("keeps an armed retry when the idle time changes", async () => {
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
		worker.updateInputs(inputs({}, 6_000));
		expect(worker.status().failures).toBe(1);
		expect(worker.status().backoff).toBeGreaterThan(0);
		await vi.advanceTimersByTimeAsync(9_000);
		expect(llm.log).toHaveLength(failedCalls);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(llm.log.length).toBeGreaterThan(failedCalls);
	});

	it("takes an update after disposal without a timer", async () => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const llm = new StubLlm();
		const root = new Context();
		const worker = new MemoryWorker(root, store, inputs({ batch: 2 }), llm);
		await root.fiber.dispose();
		roots.splice(roots.indexOf(root), 1);
		worker.updateInputs(inputs({ batch: 1 }, 1));
		worker.onMemoryTool("memory_note");
		await vi.advanceTimersByTimeAsync(600_000);
		expect(llm.log).toHaveLength(0);
	});
});

/** Give the event loop one turn, so an async pass settles before a check. */
async function flush(): Promise<void> {
	for (let index = 0; index < 8; index += 1)
		await new Promise((resolve) => setImmediate(resolve));
}
