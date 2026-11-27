/**
 * #region moduleContract
 * @modulecontract
 * @purpose Build clean summaries for dirty tree ranges, so the view holds text without waiting.
 * @scope The retry pacing, the model call limit, one compaction pass, and the mechanical rounds.
 *  NOT: the line text, the prompts, the triggers, the timers, and the model service.
 * @invariants The host owns the trigger, the timer, the loop, and the model service.
 * @invariants Failed attempts wait 10, 60, then 300 seconds. The waits and in-flight work are local
 * state, and a restart clears them: candidates always derive from the current tree.
 * @invariants A partial, malformed, or rejected batch answer keeps its good lines and retries each
 * unresolved range in a batch half the size, down to one range. A range that still fails stays dirty.
 * @keywords compaction, merge, batch, retry, rate, pass, node
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import {
	type BuildRead,
	buildInput,
	candidates,
	captureRound,
	insertNode,
	publishJoin,
	publishNode,
	type RoundEntry,
} from "../store/build.js";
import type { Store } from "../store/store.js";
import { joinText, loadView } from "../store/view.js";
import type { ScopeKey } from "../types/primitives.js";
import type { BuildInput } from "../types/tree.js";
import { DEFAULT_COMPACTION_BATCH } from "./config-types.js";
import {
	address,
	batchTask,
	copyBuild,
	finalizeLine,
	joinBuild,
	type LineBuild,
	MERGE_SYSTEM_BATCH,
	type MergeModel,
	NODE_TARGET,
	parseBatchAnswer,
} from "./merge-line.js";

const debug = debuglog("memlens:compaction");

/** The local waits between failed compaction attempts, in seconds. A restart clears them. */
export const RETRY_WAITS: readonly number[] = [10, 60, 300];

/** The counts of one compaction pass. */
export interface PassResult {
	readonly built: number;
	readonly rejected: number;
	readonly reasons: readonly "input_changed"[];

	/** The ranges that no attempt built. Each such range counts once. */
	readonly failed: number;
	readonly failures: readonly ("no_answer" | "not_shorter" | "invalid_batch")[];

	/** Each model call of the pass, the retries included. */
	readonly calls: number;
}

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
	readonly batch: number;
}

// #region FUNC_compactionPass
/**
 * @purpose Build and publish the next batch of dirty lines of one tree.
 * @invariants A pass takes at most `batch` ready inputs, ten by default, with no upper limit. The
 *   batch is a whole number above 0.
 * @invariants Inputs without a longform publish a copy or
 * fitting join with no model call. A batch makes one model call. The pass publishes each good line
 * of the answer, and asks again for each unresolved range in a batch half the size, down to one
 * range. A range that no attempt builds stays dirty. Each result checks its captured keys under the
 * write lock. A pass stores no state and starts no timers.
 * @returns The counts of the pass: built, rejected, failed, and calls.
 */
export async function compactionPass(
	store: Store,
	scope: ScopeKey,
	model: MergeModel,
	run: Partial<CompactionRun> = {},
): Promise<PassResult> {
	const batch = run.batch ?? DEFAULT_COMPACTION_BATCH;
	if (!Number.isInteger(batch) || batch < 1)
		throw new RangeError("Invalid compaction batch size");
	const result = {
		built: 0,
		rejected: 0,
		failed: 0,
		calls: 0,
		reasons: [] as "input_changed"[],
		failures: [] as ("no_answer" | "not_shorter" | "invalid_batch")[],
	};
	const captured = new Map<BuildInput, BuildRead>();
	const inputs: BuildInput[] = [];
	for (const range of candidates(store, scope)) {
		const current = buildInput(store, scope, range);
		if (!current) continue;
		captured.set(current.input, current.read);
		inputs.push(current.input);
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
	debug("Compaction pass", { scope, candidates: inputs.length });
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
	if (merges.length) await runBatch(merges, counted, publish);
	debug("Compaction pass complete", { scope, ...result });
	return result;
}
// #endregion FUNC_compactionPass

// #region FUNC_callBatch
/** Ask for the lines of one batch. A rejected call gives an empty answer. */
async function callBatch(
	batch: readonly BuildInput[],
	model: MergeModel,
): Promise<string> {
	try {
		const answer = await model(
			MERGE_SYSTEM_BATCH,
			batchTask(NODE_TARGET, batch),
		);
		return answer.trim();
	} catch (error) {
		debug("Batch call failed", { count: batch.length, error: String(error) });
		return "";
	}
}
// #endregion FUNC_callBatch

// #region FUNC_runBatch
/**
 * Publish the good lines of one batch call, then retry the unresolved ranges in halved batches.
 *
 * @invariants Each range with a good line publishes at once, whatever else the answer holds.
 * An absent line, a line that fails the shrink check, and an empty line leave a range unresolved.
 * A batch of two or more ranges retries its unresolved ranges in batches of half the size, so the
 * retries stop. A batch of one range records the failure of that range; the range stays dirty.
 */
async function runBatch(
	batch: readonly BuildInput[],
	model: MergeModel,
	publish: (input: BuildInput, line: LineBuild) => Promise<void>,
): Promise<void> {
	const answer = await callBatch(batch, model);
	const parsed = parseBatchAnswer(answer, batch);
	const unresolved: BuildInput[] = [];
	for (const input of batch) {
		const text = parsed.get(address(input.range));
		const line = finalizeLine(input, text ?? "");
		if (line.ok) await publish(input, line);
		else if (batch.length === 1)
			await publish(input, {
				ok: false,
				reason: text === undefined && answer ? "invalid_batch" : line.reason,
			});
		else unresolved.push(input);
	}
	if (!unresolved.length) return;
	const size = Math.ceil(batch.length / 2);
	debug("Batch retry", { unresolved: unresolved.length, size });
	for (let index = 0; index < unresolved.length; index += size)
		await runBatch(unresolved.slice(index, index + size), model, publish);
}
// #endregion FUNC_runBatch

// #region FUNC_publishRound
/**
 * @purpose Publish the copies and joins of one round from one view, so a big store compacts
 * without a view load per range.
 * @invariants One view load serves each read and each publish of the round. The write lock holds
 * during the round, so each publish keeps its captured keys and dates.
 * @returns The ready entries of the round and the counts of the accepted publishes.
 */
export function publishRound(
	store: Store,
	scope: ScopeKey,
): {
	readonly pending: readonly RoundEntry[];
	readonly published: number;
	readonly joined: number;
} {
	const result = store.publish((tx) => {
		// One view for the whole round: each read comes from it, and each publish
		// keeps the keys of that read. No other writer can change a key in between.
		const entries = captureRound(loadView(tx.db, scope));
		let published = 0;
		let joined = 0;
		for (const { range, read, input } of entries) {
			const [left, right] = input.children;
			// Two children join when the whole pair fits the line.
			const line = left && right ? joinBuild(input) : null;
			// One child copies when it fits. A pair above the limit stays for the
			// merge job of the caller and returns in `pending`.
			let summary: string | null = null;
			if (line !== null && read.fits) {
				summary = joinText(read.aText ?? "", read.bText ?? "").text;
				joined += 1;
			} else if (line === null && (!left || !right) && read.fits) {
				summary = copyBuild(input).summary;
			}
			if (summary === null) continue;
			insertNode(
				tx.db,
				scope,
				range.level,
				range.start,
				summary,
				read,
				tx.version,
				read.aKey,
				read.bKey,
			);
			published += 1;
		}
		debug("Round published", {
			scope,
			found: entries.length,
			published,
			joined,
		});
		return { pending: entries, published, joined };
	});
	return result.value;
}
// #endregion FUNC_publishRound
