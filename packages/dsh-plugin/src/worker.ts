/**
 * #region moduleContract
 * @purpose Run the compaction pass of the core in the background, at the dirty threshold or the idle limit.
 * @scope The worker owner, the trigger checks, the model call through the DSH LLM service, the
 *  retry pacing, the runtime inputs update, and the local state read.
 * @scope NOT: the compaction rules, the candidate choice, and the validity check. The core owns them.
 * @invariants One worker owns one store. Plugin disposal stops the timer and ends the in-flight pass.
 * @invariants All trigger state, retry counts, and rate counts stay local. A restart clears them.
 * @invariants A denied rate slot fails the call, so the affected ranges stay dirty for the next pass.
 * @invariants A read of the store never waits for this work. The pass writes only through the core.
 * @invariants The host replaces the inputs at run time. A pass uses the inputs of its start, and an
 *  update keeps the call times of the hour and the armed retry wait.
 * @dependencies node:util, @deepseek-ai/cordis, @deepseek-ai/dsh-llm, @memlens/core, @memlens/core (store helpers).
 * @keywords worker, compaction, background, timer, idle, dirty, retry, rate, llm
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { Context } from "@deepseek-ai/cordis";
import {
	type GenerateOptions,
	ReasoningEffortId,
	type StreamChunk,
} from "@deepseek-ai/dsh-llm";
import type { MergeModel } from "@memlens/core";
import {
	autoForm,
	type CompactionConfig,
	candidates,
	compactionPass,
	liveCounts,
	RateWindow,
	retryDelay,
	type Store,
	type StoreConfig,
	sweep,
} from "@memlens/core";

const debug = debuglog("memlens:plugin:worker");

/** The LLM surface that the worker needs. The host service satisfies this shape. */
export interface WorkerLlm {
	stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}

// #region INTERFACE_WorkerStatus
/**
 * @purpose State the local compaction facts that the console shows.
 * @invariants The counts stay local. A restart resets each one.
 */
export interface WorkerStatus {
	/** The count of compaction passes that started since activation. */
	readonly attempts: number;

	/** The count of merge calls that run now. */
	readonly active: number;

	/** The wait of the next retry, in seconds. Zero when no retry waits. */
	readonly backoff: number;

	/** The count of failed passes in a row. */
	readonly failures: number;

	/** The count of dirty merge ranges over each live scope. */
	readonly dirty: number;
}
// #endregion INTERFACE_WorkerStatus

/** The resolved inputs of one worker. */
export interface WorkerInputs {
	readonly compaction: CompactionConfig;
	readonly store: StoreConfig;
	readonly cacheTtl: Readonly<Record<string, number>>;
}

/** The call form of one pass: the mode, or the cache knowledge of the model under auto. */
function runSettings(inputs: WorkerInputs): {
	form: "parallel" | "batch";
	batch: number;
} {
	const mode = inputs.compaction.mode;
	if (mode === "auto") {
		return {
			form: autoForm(inputs.compaction.model, inputs.cacheTtl),
			batch: inputs.compaction.batch,
		};
	}
	return { form: mode, batch: inputs.compaction.batch };
}

// #region CLASS_MemoryWorker
/**
 * @purpose Own the background compaction of one store, from the triggers to the model calls.
 * @invariants The timer lives under a Cordis effect and ends with the owner context.
 * @invariants A disposed worker starts no pass, answers no late model reply, and starts no timer.
 * @invariants An inputs update applies to the next pass. The rate window, the running pass, and the
 *  retry wait keep their state.
 */
export class MemoryWorker {
	private readonly rate: RateWindow;
	private inputs: WorkerInputs;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private lastActivity = Date.now();
	private failures = 0;
	private running = false;
	private disposed = false;
	private attempts = 0;
	private inFlight = 0;
	private retryAt = 0;

	constructor(
		ctx: Context,
		private readonly store: Store,
		inputs: WorkerInputs,
		private readonly llm: WorkerLlm,
	) {
		this.inputs = inputs;
		this.rate = new RateWindow(inputs.compaction.maxCallsPerHour);
		ctx.effect(() => () => this.dispose());
		this.scheduleIdle();
		debug("Worker started", {
			event: "start",
			idle: inputs.store.idle,
			batch: inputs.compaction.batch,
		});
	}

	/**
	 * @purpose Record one memory tool call of any agent, then check the dirty threshold.
	 * @param name - The tool name. A call of any memory tool marks activity.
	 */
	onMemoryTool(name: string): void {
		if (!name.startsWith("memory_")) return;
		this.lastActivity = Date.now();
		this.sweepAndCheck();
	}

	// #region METHOD_status
	/**
	 * @purpose Give the local compaction state to the console, so the tab states what the worker
	 *   does now.
	 * @invariants The read writes no field and starts no pass.
	 * @returns The local counts and the count of dirty merge ranges.
	 */
	status(): WorkerStatus {
		const backoff =
			this.retryAt === 0
				? 0
				: Math.max(0, Math.ceil((this.retryAt - Date.now()) / 1000));
		return {
			attempts: this.attempts,
			active: this.inFlight,
			backoff,
			failures: this.failures,
			dirty: this.dirtyCount(),
		};
	}
	// #endregion METHOD_status

	// #region METHOD_updateInputs
	/**
	 * @purpose Apply the resolved inputs of a new configuration layer to the next pass.
	 * @invariants A running pass keeps the inputs and the call limit of its start. An armed retry
	 *  keeps its wait.
	 * @invariants A changed idle time re-arms the idle timer, unless a pass runs or a retry waits.
	 * @param inputs - The resolved inputs of the new layer.
	 */
	updateInputs(inputs: WorkerInputs): void {
		const idleChanged = inputs.store.idle !== this.inputs.store.idle;
		this.inputs = inputs;
		debug("Worker inputs updated", {
			event: "inputs",
			idle: inputs.store.idle,
			batch: inputs.compaction.batch,
			maxCallsPerHour: inputs.compaction.maxCallsPerHour,
		});
		if (this.disposed || this.running || this.retryAt !== 0) return;
		if (idleChanged) this.scheduleIdle();
	}
	// #endregion METHOD_updateInputs

	/** Close each expired proposal, then start a pass at the dirty threshold. */
	private sweepAndCheck(): void {
		sweep(this.store);
		if (this.dirtyCount() >= this.inputs.compaction.batch) void this.run();
		else this.scheduleIdle();
	}

	/** Schedule the idle check that starts one pass after the idle time of the store. */
	private scheduleIdle(): void {
		if (this.disposed) return;
		this.clearTimer();
		this.retryAt = 0;
		const waitMs =
			this.lastActivity + this.inputs.store.idle * 1000 - Date.now();
		this.timer = setTimeout(
			() => {
				this.timer = null;
				if (Date.now() - this.lastActivity < this.inputs.store.idle * 1000) {
					this.scheduleIdle();
					return;
				}
				if (this.dirtyCount() > 0) void this.run();
				else this.scheduleIdle();
			},
			Math.max(waitMs, 0),
		);
	}

	/** The count of dirty ranges over each live scope of the store. */
	private dirtyCount(): number {
		let count = 0;
		for (const scope of liveCounts(this.store).keys()) {
			count += candidates(this.store, scope).length;
		}
		return count;
	}

	/** Run one pass, then pace the next attempt from its counts. */
	private async run(): Promise<void> {
		if (this.running || this.disposed) return;
		this.running = true;
		this.attempts += 1;
		const inputs = this.inputs;
		// The pass uses the call limit of its start. The window keeps the calls of the hour.
		this.rate.setLimit(inputs.compaction.maxCallsPerHour);
		try {
			const run = runSettings(inputs);
			const model = this.modelFor(inputs);
			let built = 0;
			let failed = 0;
			for (const scope of liveCounts(this.store).keys()) {
				if (candidates(this.store, scope).length === 0) continue;
				const result = await compactionPass(this.store, scope, model, run);
				built += result.built;
				failed += result.failed;
			}
			this.failures = failed > 0 ? this.failures + 1 : 0;
			debug("Pass complete", { event: "pass", built, failed });
			if (!this.disposed) this.paceNext(failed);
		} catch (error) {
			this.failures += 1;
			debug("Pass failed", { event: "pass-error", error: String(error) });
			if (!this.disposed) this.paceNext(1);
		} finally {
			this.running = false;
		}
	}

	/** Start the retry wait after a failure, or the idle wait after a clean pass. */
	private paceNext(failed: number): void {
		if (failed > 0) {
			this.clearTimer();
			const wait = retryDelay(this.failures) * 1000;
			this.retryAt = Date.now() + wait;
			this.timer = setTimeout(() => {
				this.timer = null;
				this.retryAt = 0;
				void this.run();
			}, wait);
			debug("Retry scheduled", { event: "retry", failures: this.failures });
			return;
		}
		this.scheduleIdle();
	}

	/** The model call of one merge task, with one rate slot and the route of the given inputs. */
	private modelFor(inputs: WorkerInputs): MergeModel {
		return async (system, task) => {
			if (!this.rate.tryAcquire(Date.now()))
				throw new Error("The compaction call limit of one hour is reached.");
			this.inFlight += 1;
			try {
				let text = "";
				const effort = inputs.compaction.effort;
				const stream = this.llm.stream({
					provider: inputs.compaction.provider,
					model: inputs.compaction.model,
					...(effort === ""
						? {}
						: { reasoningEffort: ReasoningEffortId(effort) }),
					system,
					messages: [
						{
							role: "user",
							content: [{ type: "text", text: task }],
						},
					],
				});
				for await (const chunk of stream) {
					if (chunk.type === "text-delta") text += chunk.text;
				}
				return text;
			} finally {
				this.inFlight -= 1;
			}
		};
	}

	private clearTimer(): void {
		if (this.timer !== null) clearTimeout(this.timer);
		this.timer = null;
	}

	/** Stop the timer and reject each later start. Cordis disposal calls this. */
	private dispose(): void {
		this.disposed = true;
		this.retryAt = 0;
		this.clearTimer();
		debug("Worker disposed", { event: "dispose" });
	}
}
// #endregion CLASS_MemoryWorker
