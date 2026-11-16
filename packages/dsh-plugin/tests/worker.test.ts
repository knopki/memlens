/**
 * #region moduleContract
 * @purpose Prove the worker triggers, the model route, the retry pacing, the inputs update, and
 *  the disposal.
 * @scope The dirty threshold, the idle timer, the retry timer, the rate limit, the route snapshot,
 *  disposal, and the answer of a stopped stream.
 * @invariants Tests use a real store, a controlled LLM stub, and fake time. No test makes a paid call.
 * #endregion moduleContract
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import {
	type GenerateOptions,
	LlmAdapter,
	LlmRuntime,
	type StreamChunk,
} from "@deepseek-ai/dsh-llm";
import {
	type CompactionConfig,
	candidates,
	loadBaseConfig,
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
	answer = "summary";
	fail = false;
	onStream: ((options: GenerateOptions) => void) | null = null;

	/** Give the answer text of one call. Undefined gives the default text, and null throws. */
	reply:
		| ((options: GenerateOptions, call: number) => string | null | undefined)
		| null = null;

	/** Give the finish chunk of one call. The default is a clean stop. */
	finish:
		| ((options: GenerateOptions, call: number) => StreamChunk | null)
		| null = null;

	/** State whether the stream throws after its answer text. */
	throwAfter = false;

	stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
		this.log.push(options);
		this.onStream?.(options);
		const call = this.log.length;
		const scripted = this.reply?.(options, call);
		const fail = this.fail || scripted === null;
		const answer = scripted ?? this.answerFor(options);
		const finish = this.finish?.(options, call) ?? {
			type: "finish" as const,
			reason: { kind: "stop" as const },
		};
		const broke = this.throwAfter;
		return (async function* (): AsyncGenerator<StreamChunk> {
			if (fail) throw new Error("stub refusal");
			yield { type: "text-delta", index: 0, text: answer };
			if (broke) throw new Error("stream broken");
			yield finish;
		})();
	}

	/** Give the scripted text for each input id of a batch task. */
	private answerFor(options: GenerateOptions): string {
		const text = JSON.stringify(options.messages);
		const ids = [...text.matchAll(/<input id=\\?"(#[0-9]+-[0-9]+)\\?">/g)];
		if (ids.length === 0) return this.answer;
		return ids.map((match) => `${match[1]}: ${this.answer}`).join("\n");
	}
}

/** The ids of the input blocks of one batch request. */
function askedIds(options: GenerateOptions | undefined): string[] {
	if (!options) return [];
	const text = JSON.stringify(options.messages);
	return [...text.matchAll(/<input id=\\?"(#[0-9]+-[0-9]+)\\?">/g)].map(
		(match) => match[1] ?? "",
	);
}

/** The finish chunk of a provider error. */
const PROVIDER_ERROR: StreamChunk = {
	type: "finish",
	reason: {
		kind: "error",
		failure: { code: "PROVIDER_UNAVAILABLE", message: "route missing" },
	},
};

/** The finish chunk of an answer that stops at the token limit. */
const TOKEN_STOP: StreamChunk = {
	type: "finish",
	reason: { kind: "max-tokens" },
};

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
			batch: 1,
			maxCallsPerHour: 60,
			...part,
		},
		store: { path: "unused", idle },
	};
}

/** The scopes of the two long notes of one store, so one dirty range waits per scope. */
const SCOPES: readonly ScopeKey[] = ["user:a", "user:b"];

/** One store with two long notes in each named scope, so one merge range waits per scope. */
function dirtyStore(
	scopes: readonly ScopeKey[] = ["user:notes"],
	count = 2,
): Store {
	const directory = mkdtempSync(join(tmpdir(), "memlens-worker-"));
	const store = new Store(directory);
	for (const scope of scopes) addNotes(store, scope, count);
	return store;
}

/** Add two or more long notes of one scope to a live store. */
function addNotes(
	store: Store,
	scope: ScopeKey = "user:notes",
	count = 2,
): void {
	for (let index = 0; index < count; index += 1) {
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
	it.each([
		{ provider: "", model: "m" },
		{ provider: "test", model: "" },
	])("logs a missing route and makes no model call", async (route) => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		const worker = new MemoryWorker(root, store, inputs(route), llm);
		expect(worker.status().lastError).toContain("not configured");
		expect(worker.status().events[0]?.text).toContain("not configured");
		worker.onMemoryTool("memory_note");
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(0);
		expect(llm.log).toHaveLength(0);
		expect(candidates(store, "user:notes")).toHaveLength(1);
	});

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
		expect(events.length).toBeLessThanOrEqual(100);
		expect(events[events.length - 1]?.kind).toBe("pass");
		expect(events[events.length - 1]?.text).toContain("built");
	});

	it("reports call progress before the response stream closes", async () => {
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		let release = () => {};
		const closed = new Promise<void>((resolve) => {
			release = resolve;
		});
		const llm: WorkerLlm = {
			stream: () =>
				(async function* (): AsyncGenerator<StreamChunk> {
					yield { type: "text-delta", index: 0, text: "#0-1: summary" };
					yield { type: "finish", reason: { kind: "stop" } };
					await closed;
				})(),
		};
		const worker = new MemoryWorker(root, store, inputs(), llm);
		try {
			worker.onMemoryTool("memory_note");
			await vi.waitFor(() => expect(worker.status().active).toBe(1));
			const status = worker.status();
			expect(
				status.events.some((entry) =>
					entry.text.includes("call 1 started: scope user:notes"),
				),
			).toBe(true);
			expect(
				status.events.some((entry) => entry.text.includes("call 1 done")),
			).toBe(false);
			release();
			await vi.waitFor(() =>
				expect(
					worker
						.status()
						.events.some((entry) =>
							entry.text.includes("call 1 done: finish stop"),
						),
				).toBe(true),
			);
			expect(
				worker
					.status()
					.events.some(
						(entry) =>
							entry.text.includes("scope user:notes") &&
							entry.text.includes("built 1"),
					),
			).toBe(true);
		} finally {
			release();
		}
	});

	it("reports a terminal model error and rejects partial text", async () => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm: WorkerLlm = {
			stream: () =>
				(async function* (): AsyncGenerator<StreamChunk> {
					yield { type: "text-delta", index: 0, text: "#0-1: partial summary" };
					yield {
						type: "finish",
						reason: {
							kind: "error",
							failure: {
								code: "PROVIDER_UNAVAILABLE",
								message: "route missing",
							},
						},
					};
				})(),
		};
		const worker = new MemoryWorker(root, store, inputs(), llm);
		worker.onMemoryTool("memory_note");
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(0);
		const status = worker.status();
		expect(status.lastError).toContain("PROVIDER_UNAVAILABLE: route missing");
		expect(
			status.events.find((entry) => entry.kind === "error")?.text,
		).toContain("route missing");
		expect(candidates(store, "user:notes")).toHaveLength(1);
	});

	it("dispatches the configured route through the real DSH LLM runtime", async () => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new LlmRuntime(root);
		const calls: GenerateOptions[] = [];
		class Adapter extends LlmAdapter {
			async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
				calls.push(options);
				yield { type: "text-delta", index: 0, text: "#0-1: summary" };
				yield { type: "finish", reason: { kind: "stop" } };
			}
		}
		llm.registerAdapter(["magpie"], new Adapter());
		const worker = new MemoryWorker(
			root,
			store,
			inputs({
				...loadBaseConfig(
					'[compaction]\nprovider = "magpie"\nmodel = "auto/deepseek-v4.1-flash"',
					"unused",
				).compaction,
				batch: 1,
			}),
			llm,
		);
		worker.onMemoryTool("memory_note");
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(0);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({
			provider: "magpie",
			model: "auto/deepseek-v4.1-flash",
		});
		expect(calls[0]).not.toHaveProperty("reasoningEffort");
		expect(candidates(store, "user:notes")).toHaveLength(0);
	});

	it("passes an explicitly configured effort", async () => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		const worker = new MemoryWorker(
			root,
			store,
			inputs({ effort: "off" }),
			llm,
		);
		worker.onMemoryTool("memory_note");
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(0);
		expect(llm.log[0]?.reasoningEffort).toBe("off");
	});

	it("reports an unregistered provider from the real DSH LLM runtime", async () => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new LlmRuntime(root);
		const worker = new MemoryWorker(
			root,
			store,
			inputs({ provider: "missing-route" }),
			llm,
		);
		worker.onMemoryTool("memory_note");
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(0);
		expect(worker.status().lastError).toContain("missing-route");
		expect(
			worker.status().events.find((entry) => entry.kind === "error")?.text,
		).toContain("missing-route");
		expect(candidates(store, "user:notes")).toHaveLength(1);
	});

	it("states the rejection reasons of failed merge answers", async () => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		llm.answer = `#0-1: ${"x".repeat(1000)}`;
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

	it("drains a backlog above the batch without a full idle wait", async () => {
		vi.useFakeTimers();
		const store = new Store(mkdtempSync(join(tmpdir(), "memlens-worker-")));
		stores.push(store);
		for (let index = 0; index < 8; index += 1) {
			note(store, {
				scope: "user:notes",
				kind: "note",
				body: `${"long body ".repeat(40)}${index}`,
				session: "session-1",
				turn: "turn-1",
				preset: "default",
				ts: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
			});
		}
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
		await vi.advanceTimersByTimeAsync(0);
		expect(worker.status().attempts).toBe(1);
		const afterFirst = candidates(store, "user:notes").length;
		expect(afterFirst).toBeLessThan(8);
		// The next pass starts at once, well before the idle time of 600 s.
		await vi.advanceTimersByTimeAsync(1_000);
		expect(worker.status().attempts).toBeGreaterThan(1);
		expect(candidates(store, "user:notes").length).toBeLessThan(afterFirst);
	});

	it("keeps the armed retry when a tool call arrives", async () => {
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
		await vi.advanceTimersByTimeAsync(0);
		const failedCalls = llm.log.length;
		expect(worker.status().backoff).toBeGreaterThan(0);
		worker.onMemoryTool("memory_note");
		await vi.advanceTimersByTimeAsync(0);
		expect(llm.log).toHaveLength(failedCalls);
		expect(worker.status().backoff).toBeGreaterThan(0);
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

	it("publishes the answered ranges and halves the rest", async () => {
		const store = dirtyStore(["user:notes"], 4);
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		llm.reply = (options, call) =>
			call === 1 ? `${askedIds(options)[0]}: first summary` : undefined;
		const worker = new MemoryWorker(root, store, inputs({ batch: 2 }), llm);
		worker.onMemoryTool("memory_note");
		await flush();
		const first = askedIds(llm.log[0]);
		const second = askedIds(llm.log[1]);
		expect(first).toHaveLength(2);
		expect(second).toHaveLength(1);
		expect(first).toContain(second[0]);
		expect(llm.log.length).toBeGreaterThanOrEqual(2);
		// Each range of the batch published, and the recovered call left no error.
		expect(
			candidates(store, "user:notes").filter((range) => range.level === 1),
		).toHaveLength(0);
		expect(worker.status().lastError).toBeNull();
		expect(
			worker.status().events.some((entry) => entry.text.includes("built 2")),
		).toBe(true);
	});

	it("keeps the range that fails alone dirty and visible", async () => {
		const store = dirtyStore(["user:notes"], 4);
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		llm.reply = (options, call) =>
			call === 1 ? `${askedIds(options)[0]}: first summary` : "x".repeat(1000);
		const worker = new MemoryWorker(root, store, inputs({ batch: 2 }), llm);
		worker.onMemoryTool("memory_note");
		await flush();
		const first = askedIds(llm.log[0]);
		expect(first).toHaveLength(2);
		expect(llm.log.length).toBeGreaterThanOrEqual(2);
		expect(worker.status().lastError).toContain("invalid_batch");
		const left = candidates(store, "user:notes").filter(
			(range) => range.level === 1,
		);
		expect(left).toHaveLength(1);
		expect(
			worker.status().events.filter((entry) => entry.kind === "error").length,
		).toBeGreaterThan(0);
	});

	it("keeps the complete lines of a stopped answer and clears a recovered error", async () => {
		const store = dirtyStore(["user:notes"], 4);
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		llm.finish = (_options, call) => (call === 1 ? PROVIDER_ERROR : null);
		llm.reply = (options, call) => {
			if (call !== 1) return undefined;
			const ids = askedIds(options);
			return `${ids[0]}: first summary\n${ids[1]}: cut`;
		};
		const worker = new MemoryWorker(root, store, inputs({ batch: 2 }), llm);
		worker.onMemoryTool("memory_note");
		await flush();
		// The whole line of the first range published, and the cut line stayed out.
		expect(
			candidates(store, "user:notes").filter((range) => range.level === 1),
		).toHaveLength(0);
		const events = worker.status().events;
		expect(
			events.some((entry) =>
				entry.text.includes("PROVIDER_UNAVAILABLE: route missing"),
			),
		).toBe(true);
		expect(events.some((entry) => entry.text.includes("kept 1 complete"))).toBe(
			true,
		);
		expect(worker.status().lastError).toBeNull();
	});

	it("keeps the cut line of a token stop out of the store", async () => {
		vi.useFakeTimers();
		const store = dirtyStore();
		stores.push(store);
		const root = new Context();
		roots.push(root);
		const llm = new StubLlm();
		llm.finish = () => TOKEN_STOP;
		llm.answer = `#0-1: half a line`;
		const worker = new MemoryWorker(root, store, inputs(), llm);
		worker.onMemoryTool("memory_note");
		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(0);
		expect(worker.status().lastError).toContain("token limit");
		expect(candidates(store, "user:notes")).toHaveLength(1);
		const answered = worker
			.status()
			.events.filter((entry) => entry.text.includes("call 1 done"));
		expect(answered).toHaveLength(0);
	});

	it("makes no model call and writes no row after disposal", async () => {
		const store = dirtyStore(SCOPES);
		stores.push(store);
		const root = new Context();
		roots.push(root);
		let release = () => {};
		const open = new Promise<void>((resolve) => {
			release = resolve;
		});
		let calls = 0;
		const llm: WorkerLlm = {
			stream: () => {
				calls += 1;
				return (async function* (): AsyncGenerator<StreamChunk> {
					yield { type: "text-delta", index: 0, text: "#0-1: summary" };
					yield { type: "finish", reason: { kind: "stop" } };
					await open;
				})();
			},
		};
		const worker = new MemoryWorker(root, store, inputs(), llm);
		worker.onMemoryTool("memory_note");
		await vi.waitFor(() => expect(worker.status().active).toBe(1));
		const before = worker.status().events.length;
		await root.fiber.dispose();
		roots.splice(roots.indexOf(root), 1);
		release();
		await flush();
		expect(calls).toBe(1);
		expect(worker.status().events.length).toBe(before);
		expect(candidates(store, "user:a")).toHaveLength(1);
		expect(candidates(store, "user:b")).toHaveLength(1);
	});

	it("records one denial and asks no other call in the pass", async () => {
		const store = dirtyStore(["user:a", "user:b", "user:c"]);
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
		await flush();
		expect(llm.log).toHaveLength(1);
		const status = worker.status();
		expect(status.lastError).toContain("call limit");
		expect(
			status.events.filter((entry) =>
				/^call 2: scope user:b; The compaction call limit/.test(entry.text),
			),
		).toHaveLength(1);
		expect(candidates(store, "user:b")).toHaveLength(1);
		expect(candidates(store, "user:c")).toHaveLength(1);
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
