/**
 * #region moduleContract
 * @purpose Run the compaction pass of the core in the background, at the dirty threshold or the idle limit.
 * @scope The worker owner, the trigger checks, the batch model call through the DSH LLM service,
 *  the call limit, the retry pacing, the runtime inputs update, and the local state read.
 * @scope NOT: the compaction rules, the candidate choice, and the validity check. The core owns them.
 * @invariants One worker owns one store. Plugin disposal stops the timer and ends the in-flight pass.
 * @invariants All trigger state, retry counts, and rate counts stay local. A restart clears them.
 * @invariants A denied rate slot fails the call, so the affected ranges stay dirty for the next pass.
 *  The first denial of a pass stops the other calls of that pass, so a split asks no denied call.
 * @invariants A stopped stream keeps its complete answer lines, and a range without a line stays
 *  dirty. A pass reports the error text of its calls, and a recovered call leaves no error.
 * @invariants A disposed worker calls no model, keeps no late answer, and writes no store row.
 * @invariants A read of the store never waits for this work. The pass writes only through the core.
 * @invariants The host replaces the inputs at run time. A pass uses the inputs of its start, and an
 *  update keeps the call times of the hour and the armed retry wait.
 * @invariants The journal holds the last hundred events in local state, and the host log mirrors each
 *  entry. A restart clears the journal.
 * @dependencies USES API: node:util, @deepseek-ai/cordis, @deepseek-ai/dsh-llm, @memlens/core
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
	type CompactionConfig,
	candidates,
	compactionPass,
	liveCounts,
	RateWindow,
	retryDelay,
	type Store,
	type StoreConfig,
	sweep,
	toIso,
} from "@memlens/core";

const debug = debuglog("memlens:plugin:worker");

/** The prefix of each host log line of the worker. */
const LOG = "[dsh-memlens] ";

/** The greatest count of journal events that the worker keeps. */
const JOURNAL_LIMIT = 100;

/** The delay of the first check after activation, in seconds. */
const STARTUP_DELAY = 10;

/** The error for an absent compaction route. */
const MISSING_ROUTE =
	"The compaction model is not configured. Set provider and model.";

/** The error of a call that starts after the worker disposal. */
const DISPOSED = "The worker is disposed.";

/** The error of a call above the call limit of one hour. */
const RATE_DENIAL = "The compaction call limit of one hour is reached.";

/** The error of an answer that stops at the token limit. */
const TOKEN_LIMIT = "The answer stopped at the token limit.";

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

	/** The provider of the model route of the current inputs. */
	readonly provider: string;

	/** The model of the route of the current inputs. */
	readonly model: string;

	/** The start time of the last pass, or null before the first pass. */
	readonly lastRunAt: string | null;

	/** The time of the next timer fire, or null when a pass runs or no timer waits. */
	readonly nextRunAt: string | null;

	/** The error text of the last failed call or pass, or null after a clean pass. */
	readonly lastError: string | null;

	/** The recent events of the local journal, oldest entry first. */
	readonly events: WorkerEvent[];
}
// #endregion INTERFACE_WorkerStatus

/** One recent event of the local worker journal. */
export interface WorkerEvent {
	/** The time of the event. */
	readonly at: string;

	/** The class of the event. */
	readonly kind: "pass" | "call" | "retry" | "error";

	/** The event text in Simplified Technical English. */
	readonly text: string;
}

/** The resolved inputs of one worker. */
export interface WorkerInputs {
	readonly compaction: CompactionConfig;
	readonly store: StoreConfig;
}

/** Count each rejection reason of one pass into the summary map. */
function count(map: Map<string, number>, reasons: readonly string[]): void {
	for (const reason of reasons) map.set(reason, (map.get(reason) ?? 0) + 1);
}

/** State whether the inputs name a complete model route. */
function hasRoute(compaction: CompactionConfig): boolean {
	return Boolean(compaction.provider.trim() && compaction.model.trim());
}

/**
 * @purpose Keep the whole output lines of a stopped stream.
 * @invariants A part without its newline can be cut, so the worker drops the last part. The core
 *  reads the lines that remain, so the worker keeps the text as it came.
 */
function completeLines(text: string): string {
	const cut = text.lastIndexOf("\n");
	return cut === -1 ? "" : text.slice(0, cut + 1);
}

// #region CLASS_MemoryWorker
/**
 * @purpose Own the background compaction of one store, from the triggers to the model calls.
 * @invariants The timer lives under a Cordis effect and ends with the owner context.
 * @invariants The worker holds one timer. Each arm replaces it, and the first arm fires ten seconds
 *  after activation.
 * @invariants A disposed worker starts no pass, answers no late model reply, and starts no timer.
 * @invariants An inputs update applies to the next pass. The rate window, the running pass, and the
 *  retry wait keep their state.
 */
export class MemoryWorker {
	private readonly rate: RateWindow;
	private inputs: WorkerInputs;
	private timer: ReturnType<typeof setTimeout> | null = null;

	/** The time when the armed timer fires, or zero when no timer waits. */
	private timerAt = 0;
	private lastActivity = Date.now();
	private failures = 0;
	private running = false;
	private disposed = false;
	private attempts = 0;
	private inFlight = 0;
	private calls = 0;
	private retryAt = 0;
	private lastRunAt = 0;
	private lastError: string | null = null;

	/** State whether a call of the pass met the call limit of one hour. */
	private rateDenied = false;
	private readonly journal: WorkerEvent[] = [];

	constructor(
		ctx: Context,
		private readonly store: Store,
		inputs: WorkerInputs,
		private readonly llm: WorkerLlm,
	) {
		this.inputs = inputs;
		this.rate = new RateWindow(inputs.compaction.maxCallsPerHour);
		if (!hasRoute(inputs.compaction)) {
			this.lastError = MISSING_ROUTE;
			this.record("error", this.lastError);
		}
		ctx.effect(() => () => this.dispose());
		this.arm(STARTUP_DELAY * 1000);
		debug("Worker started", {
			event: "start",
			startupDelay: STARTUP_DELAY,
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
			provider: this.inputs.compaction.provider,
			model: this.inputs.compaction.model,
			lastRunAt: this.lastRunAt === 0 ? null : toIso(this.lastRunAt),
			nextRunAt:
				this.running || this.timerAt === 0 ? null : toIso(this.timerAt),
			lastError: this.lastError,
			events: [...this.journal],
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
		if (!hasRoute(inputs.compaction) && this.lastError !== MISSING_ROUTE) {
			this.lastError = MISSING_ROUTE;
			this.record("error", this.lastError);
		}
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

	/**
	 * @purpose Close each expired proposal, then check the dirty threshold.
	 * @invariants An armed retry keeps its wait. A running pass keeps its own pacing.
	 */
	private sweepAndCheck(): void {
		sweep(this.store);
		if (this.running || this.retryAt !== 0) return;
		if (this.dirtyCount() >= this.inputs.compaction.batch) void this.run();
		else this.scheduleIdle();
	}

	/**
	 * @purpose Arm the idle check of the store, so one pass starts after the idle time.
	 * @invariants An expired wait counts as activity, so no zero-delay timer repeats.
	 */
	private scheduleIdle(): void {
		this.retryAt = 0;
		let wait = this.lastActivity + this.inputs.store.idle * 1000 - Date.now();
		if (wait <= 0) {
			this.lastActivity = Date.now();
			wait = this.inputs.store.idle * 1000;
		}
		this.arm(wait);
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
		this.clearTimer();
		this.retryAt = 0;
		this.attempts += 1;
		this.lastRunAt = Date.now();
		this.lastError = null;
		this.rateDenied = false;
		const inputs = this.inputs;
		// The pass uses the call limit of its start. The window keeps the calls of the hour.
		this.rate.setLimit(inputs.compaction.maxCallsPerHour);
		try {
			if (!hasRoute(inputs.compaction)) throw new Error(MISSING_ROUTE);
			const batch = inputs.compaction.batch;
			const pending = [...liveCounts(this.store)]
				.map(
					([scope]) => [scope, candidates(this.store, scope).length] as const,
				)
				.filter(([, dirty]) => dirty > 0);
			this.record(
				"pass",
				`pass ${this.attempts} started: batch ${batch}, dirty ${pending.reduce((sum, [, dirty]) => sum + dirty, 0)}`,
			);
			let built = 0;
			let failed = 0;
			const reasons = new Map<string, number>();
			for (const [scope, dirty] of pending) {
				const result = await compactionPass(
					this.store,
					scope,
					this.modelFor(inputs, scope),
					{ batch },
				);
				// A disposed worker reads no store and records no event.
				if (this.disposed) return;
				this.record(
					"pass",
					`pass ${this.attempts}: scope ${scope}, dirty ${dirty}, built ${result.built}, rejected ${result.rejected}, failed ${result.failed}, calls ${result.calls}`,
				);
				built += result.built;
				failed += result.failed;
				count(reasons, result.failures);
				count(reasons, result.reasons);
			}
			const summary = [...reasons]
				.map(([reason, count]) => `${reason} ${count}`)
				.join(", ");
			this.failures = failed > 0 ? this.failures + 1 : 0;
			// A pass that resolves each range reports no error, and the journal keeps the call error.
			if (failed === 0) this.lastError = null;
			else if (this.lastError === null && summary)
				this.lastError = `merge answers rejected: ${summary}`;
			this.record(
				failed === 0 ? "pass" : "error",
				`compaction pass: built ${built}, failed ${failed}` +
					(summary ? ` (${summary})` : "") +
					(failed > 0 && this.lastError ? `; ${this.lastError}` : ""),
			);
			debug("Pass complete", { event: "pass", built, failed, summary });
			if (!this.disposed) this.paceNext(built, failed);
		} catch (error) {
			if (this.disposed) return;
			this.failures += 1;
			const text = error instanceof Error ? error.message : String(error);
			this.lastError = text;
			this.record("error", `compaction pass failed: ${text}`);
			debug("Pass failed", { event: "pass-error", error: text });
			if (!this.disposed) this.paceNext(0, 1);
		} finally {
			this.running = false;
		}
	}

	/**
	 * @purpose Pace the next attempt from the counts of the pass that just ended.
	 * @invariants A failed pass waits the retry delay. A pass that built a node starts the next pass
	 *  at once while work waits, so a backlog drains in one run of passes. A pass that built nothing
	 *  waits one idle time, so rejected or unchanged ranges make no spin.
	 */
	private paceNext(built: number, failed: number): void {
		if (failed > 0) {
			const wait = retryDelay(this.failures) * 1000;
			this.retryAt = Date.now() + wait;
			this.arm(wait);
			this.record("retry", `compaction retry in ${wait / 1000} s`);
			debug("Retry scheduled", { event: "retry", failures: this.failures });
			return;
		}
		if (built > 0 && this.dirtyCount() > 0) {
			this.arm(0);
			return;
		}
		this.scheduleIdle();
	}

	/**
	 * @purpose Run the batch model call of one pass, with one rate slot and the route of the given
	 *   inputs, and keep the complete lines of an answer that stops.
	 * @invariants The worker starts no call after its disposal, and it returns no late answer.
	 * @invariants The first denied call of a pass records the denial, and the other calls of that pass
	 *  fail at once with no slot and no model call.
	 * @invariants A stopped stream gives its complete lines only. The cut last part stays out, and the
	 *  reason of the stop goes to the journal and to the pass.
	 */
	private modelFor(inputs: WorkerInputs, scope: string): MergeModel {
		return async (system, task) => {
			const call = ++this.calls;
			if (this.disposed) throw new Error(DISPOSED);
			if (this.rateDenied) throw new Error(RATE_DENIAL);
			if (!this.rate.tryAcquire(Date.now())) {
				this.rateDenied = true;
				this.lastError ??= RATE_DENIAL;
				this.record("error", `call ${call}: scope ${scope}; ${RATE_DENIAL}`);
				throw new Error(RATE_DENIAL);
			}
			const started = Date.now();
			this.inFlight += 1;
			this.record(
				"call",
				`call ${call} started: scope ${scope}, input ${system.length + task.length} chars`,
			);
			try {
				let text = "";
				let finish = "none";
				let stopped: string | null = null;
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
				try {
					for await (const chunk of stream) {
						if (this.disposed) throw new Error(DISPOSED);
						if (chunk.type === "text-delta") text += chunk.text;
						else if (chunk.type === "finish") {
							const reason = chunk.reason;
							finish = reason.kind;
							if (reason.kind === "error" || reason.kind === "aborted")
								stopped = `${reason.failure.code}: ${reason.failure.message}`;
						}
					}
				} catch (error) {
					if (this.disposed) throw error;
					stopped = error instanceof Error ? error.message : String(error);
				}
				if (this.disposed) throw new Error(DISPOSED);
				let answer = text;
				if (stopped !== null || finish === "max-tokens") {
					const why = stopped ?? TOKEN_LIMIT;
					answer = completeLines(text);
					if (!answer) throw new Error(why);
					this.lastError ??= why;
					this.record(
						"error",
						`call ${call} stopped after ${Date.now() - started} ms: ${why}; kept ${answer.split("\n").length - 1} complete lines`,
					);
				}
				this.record(
					"call",
					`call ${call} done: finish ${finish}, output ${answer.length} chars, ${Date.now() - started} ms`,
				);
				return answer;
			} catch (error) {
				if (this.disposed) throw error;
				const message = error instanceof Error ? error.message : String(error);
				this.lastError ??= message;
				this.record(
					"error",
					`call ${call} failed after ${Date.now() - started} ms: ${message}`,
				);
				throw error;
			} finally {
				this.inFlight -= 1;
			}
		};
	}

	/** Act at the armed time: retry a failed pass, start a pass at dirty work, or wait one idle time. */
	private onTimer(): void {
		if (this.disposed || this.running) return;
		if (this.retryAt !== 0) {
			this.retryAt = 0;
			void this.run();
			return;
		}
		if (this.dirtyCount() > 0) {
			void this.run();
			return;
		}
		this.scheduleIdle();
	}

	/**
	 * @purpose Arm the one timer of the worker.
	 * @invariants Each call replaces the former timer. The recorded fire time gives the status.
	 * @param wait - The delay in milliseconds. A negative delay fires at once.
	 */
	private arm(wait: number): void {
		if (this.disposed) return;
		this.clearTimer();
		const delay = Math.max(wait, 0);
		this.timerAt = Date.now() + delay;
		this.timer = setTimeout(() => {
			this.timer = null;
			this.timerAt = 0;
			this.onTimer();
		}, delay);
	}

	private clearTimer(): void {
		if (this.timer !== null) clearTimeout(this.timer);
		this.timer = null;
		this.timerAt = 0;
	}

	/**
	 * @purpose Add one event to the journal, mirror it to the host log, and keep the newest entries.
	 * @invariants The journal holds at most one hundred entries. The host log holds each entry.
	 * @param kind - The class of the event.
	 * @param text - The event text in Simplified Technical English.
	 */
	private record(kind: WorkerEvent["kind"], text: string): void {
		this.journal.push({ at: toIso(Date.now()), kind, text });
		if (this.journal.length > JOURNAL_LIMIT)
			this.journal.splice(0, this.journal.length - JOURNAL_LIMIT);
		console.log(`${LOG}${text}`);
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
