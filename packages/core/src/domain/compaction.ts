/**
 * #region moduleContract
 * @modulecontract
 * @purpose Build clean summaries for dirty tree ranges, so the view holds text without waiting.
 * @scope The call form of auto, the retry pacing, the model call limit, and one compaction pass.
 *  NOT: the line text, the prompts, the triggers, the timers, and the model service.
 * @invariants The host owns the trigger, the timer, the loop, and the model service.
 * @invariants Failed attempts wait 10, 60, then 300 seconds. The waits and in-flight work are local
 * state, and a restart clears them: candidates always derive from the current tree.
 * @dependencies store/build.ts, store/store.ts, domain/merge-line.ts.
 * @keywords compaction, merge, batch, parallel, retry, rate, pass, node
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import {
	type BuildRead,
	publishJoin,
	publishNode,
	readBuild,
	candidates as storeCandidates,
} from "../store/build.js";
import type { Store } from "../store/store.js";
import type { ScopeKey } from "../types/primitives.js";
import type { BuildChild, BuildInput } from "../types/tree.js";
import {
	address,
	batchTask,
	finalizeLine,
	type LineBuild,
	MERGE_SYSTEM,
	type MergeModel,
	mergeLine,
	NODE_TARGET,
	parseBatchAnswer,
} from "./merge-line.js";

const debug = debuglog("memlens:compaction");

/** The local waits between failed compaction attempts, in seconds. A restart clears them. */
export const RETRY_WAITS: readonly number[] = [10, 60, 300];

/** The default line count of one compaction batch. */
export const COMPACTION_BATCH = 6;

/** The concurrent call count of the parallel form. */
export const COMPACTION_PARALLEL = 6;

/** The resolved settings of one compaction pass. */
export interface CompactionRun {
	readonly form: "parallel" | "batch";
	readonly batch: number;
	readonly parallel: number;
}

/** The counts of one compaction pass. */
export interface PassResult {
	readonly built: number;
	readonly rejected: number;
	readonly reasons: readonly "input_changed"[];
	readonly failed: number;
	readonly failures: readonly ("no_answer" | "not_shorter")[];
	readonly calls: number;
}

/** Match one cacheTtl glob against a model name. A `P/*` pattern matches the family of P. */
function matchGlob(pattern: string, model: string): boolean {
	const family = /^(.+)\/\*$/.exec(pattern);
	if (family?.[1])
		return (
			model === family[1] ||
			model.startsWith(`${family[1]}/`) ||
			model.startsWith(`${family[1]}-`)
		);
	const source = pattern
		.split("*")
		.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join(".*");
	return new RegExp(`^${source}$`).test(model);
}

// #region FUNC_autoForm
/**
 * @purpose Pick the call form of auto from the cache knowledge of the model.
 * @invariants A model under a specific cacheTtl glob gives parallel: a family pattern P/* matches
 * the exact name P and each name after P/ or P-. The bare "*" and no match give batch.
 * The most specific glob wins.
 */
export function autoForm(
	model: string,
	cacheTtl: Readonly<Record<string, number>>,
): "parallel" | "batch" {
	let best = "";
	for (const pattern of Object.keys(cacheTtl)) {
		if (
			pattern !== "*" &&
			pattern.length > best.length &&
			matchGlob(pattern, model)
		)
			best = pattern;
	}
	return best ? "parallel" : "batch";
}
// #endregion FUNC_autoForm

// #region FUNC_retryDelay
/** @purpose Give the local wait after the given count of failed attempts. */
export function retryDelay(failures: number): number {
	return (
		RETRY_WAITS[Math.min(Math.max(failures, 1), RETRY_WAITS.length) - 1] ?? 300
	);
}
// #endregion FUNC_retryDelay

// #region CLASS_RateWindow
/**
 * @purpose Keep one hour of model call times, so a compaction at the limit defers its calls.
 * @invariants The window keeps the timestamps of the last hour. tryAcquire records a call and
 * returns false at the limit. The window holds no durable state.
 * @invariants A pass calls the model at most max times in one hour. A pass at the limit defers
 * its calls, while the affected ranges stay dirty.
 * @invariants setLimit keeps the recorded calls of the hour and applies the new limit to them.
 */
export class RateWindow {
	private calls: number[] = [];
	private limit: number;

	constructor(max: number) {
		this.limit = max;
	}

	/** The call limit of one hour. */
	get max(): number {
		return this.limit;
	}

	// #region METHOD_setLimit
	/**
	 * @purpose Apply a new call limit without a lost count of the calls of this hour.
	 * @invariants The recorded calls stay. A lower limit can deny the next call at once.
	 * @param max - The call limit of one hour.
	 */
	setLimit(max: number): void {
		this.limit = max;
		debug("Rate limit set", { max, used: this.calls.length });
	}
	// #endregion METHOD_setLimit

	tryAcquire(now: number): boolean {
		this.calls = this.calls.filter((time) => now - time < 3_600_000);
		if (this.calls.length >= this.limit) {
			debug("Rate limit reached", { used: this.calls.length, max: this.limit });
			return false;
		}
		this.calls.push(now);
		return true;
	}
}
// #endregion CLASS_RateWindow

/** The resolved settings of one compaction pass. */
export interface CompactionRun {
	readonly form: "parallel" | "batch";
	readonly batch: number;
	readonly parallel: number;
}

// #region FUNC_compactionPass
/**
 * @purpose Build and publish the next batch of dirty lines of one tree.
 * @invariants A pass takes at most batch ready inputs and uses one form only. Inputs without a
 * longform publish a copy or fitting join with no model call.
 * The batch form makes one call, retries a broken answer once with the error text, then falls
 * back to parallel. Each result checks its captured keys under the write lock. A pass stores no state and starts no timers.
 * @returns The counts of the pass: built, rejected, failed, and calls.
 */
export async function compactionPass(
	store: Store,
	scope: ScopeKey,
	model: MergeModel,
	run: Partial<CompactionRun> = {},
): Promise<PassResult> {
	const form = run.form ?? "parallel";
	const batch = run.batch ?? COMPACTION_BATCH;
	const parallel = run.parallel ?? COMPACTION_PARALLEL;
	const result = {
		built: 0,
		rejected: 0,
		failed: 0,
		calls: 0,
		reasons: [] as "input_changed"[],
		failures: [] as ("no_answer" | "not_shorter")[],
	};
	const captured = new Map<BuildInput, BuildRead>();
	const inputs: BuildInput[] = [];
	for (const range of storeCandidates(store, scope)) {
		const read = readBuild(store, scope, range.level, range.start);
		if (!read.ok) continue;
		const width = 2 ** (range.level - 1);
		const child = (
			text: string | null,
			key: string | null,
			start: number,
		): BuildChild | null => {
			if (text === null) return null;
			if (range.level === 1)
				return {
					kind: "record",
					id: key ?? "",
					pos: start,
					body: text,
					preview:
						start === range.start
							? (read.aPreview ?? "")
							: (read.bPreview ?? ""),
					ts: start === range.start ? read.tsFrom : read.tsTo,
				};
			return {
				kind: "node",
				id: key ?? "",
				range: { start, level: range.level - 1 },
				summary: text,
				ts_from: read.tsFrom,
				ts_to: read.tsTo,
			};
		};
		const input: BuildInput = {
			range,
			children: [
				child(read.aText, read.aKey, range.start),
				child(read.bText, read.bKey, range.start + width),
			],
		};
		captured.set(input, read);
		inputs.push(input);
		if (inputs.length >= batch) break;
	}
	const counted: MergeModel = async (system, task) => {
		result.calls += 1;
		return model(system, task);
	};
	const publish = async (input: BuildInput, line: LineBuild): Promise<void> => {
		if (!line.ok) {
			result.failed += 1;
			result.failures.push(line.reason);
			debug("Merge answer failed", {
				start: input.range.start,
				level: input.range.level,
				reason: line.reason,
			});
			return;
		}
		const read = captured.get(input);
		if (!read) throw new Error("Build input is absent.");
		const published = publishNode(
			store,
			scope,
			input.range.level,
			input.range.start,
			line.summary,
			read,
		);
		if (published.ok) result.built += 1;
		else {
			result.rejected += 1;
			debug("Build rejected", {
				scope,
				start: input.range.start,
				level: input.range.level,
				reason: published.reason,
			});
		}
	};
	debug("Compaction pass", { scope, form, candidates: inputs.length });
	const merges: BuildInput[] = [];
	for (const input of inputs) {
		const read = captured.get(input);
		if (!read) throw new Error("Build input is absent.");
		if (read.fits) {
			const published = publishJoin(
				store,
				scope,
				input.range.level,
				input.range.start,
				read,
			);
			if (published.ok) result.built += 1;
			else {
				result.rejected += 1;
				debug("Build rejected", {
					scope,
					start: input.range.start,
					level: input.range.level,
					reason: published.reason,
				});
			}
		} else merges.push(input);
	}
	if (merges.length) {
		if (form === "batch") await runBatch(merges, counted, publish, parallel);
		else await runParallel(merges, counted, publish, parallel);
	}
	debug("Compaction pass complete", { scope, ...result });
	return result;
}
// #endregion FUNC_compactionPass

/** Publish each merge input through one concurrent group of model calls. */
async function runParallel(
	merges: readonly BuildInput[],
	model: MergeModel,
	publish: (input: BuildInput, line: LineBuild) => Promise<void>,
	parallel: number,
): Promise<void> {
	for (let index = 0; index < merges.length; index += parallel) {
		await Promise.all(
			merges
				.slice(index, index + parallel)
				.map(async (input) => publish(input, await mergeLine(input, model))),
		);
	}
}

/**
 * Publish each merge input from one batch call, with one retry, then a parallel fallback.
 *
 * @invariants The batch form makes one call for up to 6 lines. A broken answer gives one retry
 * with the error of the first answer, and a second broken answer falls back to parallel.
 */
async function runBatch(
	merges: readonly BuildInput[],
	model: MergeModel,
	publish: (input: BuildInput, line: LineBuild) => Promise<void>,
	parallel: number,
): Promise<void> {
	const task = batchTask(NODE_TARGET, merges);
	let answer = "";
	try {
		answer = (await model(MERGE_SYSTEM, task)).trim();
	} catch (error) {
		debug("Batch failed", { error: String(error) });
	}
	let parsed = parseBatchAnswer(answer, merges);
	if (!parsed) {
		const retry = `${task}\nThe last answer did not parse. Answer one line for each input, in the form "#a-b: line". The last answer was:\n${answer}`;
		try {
			answer = (await model(MERGE_SYSTEM, retry)).trim();
			parsed = parseBatchAnswer(answer, merges);
		} catch (error) {
			debug("Batch retry failed", { error: String(error) });
		}
	}
	if (!parsed) {
		debug("Batch broken twice", { count: merges.length, fallback: "parallel" });
		await runParallel(merges, model, publish, parallel);
		return;
	}
	for (const input of merges) {
		const text = parsed.get(address(input.range)) ?? "";
		await publish(input, finalizeLine(input, text));
	}
}
