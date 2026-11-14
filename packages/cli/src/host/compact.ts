/**
 * Console compaction action.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give the browser one compaction job and write its answers, so a user compacts the
 *   memory from the console.
 * @scope
 *  - The actions compact and compact-answer.
 *  - NOT: the merge rules of the library and the read routes.
 * @usecases
 *  - Job: user => presses compact => gets the merge inputs of one scope
 * @dependencies USES API: @memlens/core, compact.ts, host/http.ts
 * @keywords ui, compact, merge, answer, node, job
 * #endregion moduleContract
 */

import type { BuildInput, ScopeKey } from "@memlens/core";
import { MemlensError } from "@memlens/core";
import { applyAnswers, parseAnswers, prepareCompact } from "../compact.js";
import type { Runtime } from "../runtime.js";
import { type Fields, text } from "./http.js";

// #region FUNC_compactAction
/**
 * Give one job, or write one answer.
 *
 * @purpose Use the same compaction rules as the command, so both hosts build one tree.
 * @invariants The answer applies only to a copy input of its job. A stale input counts as
 *   rejected.
 */
export async function compactAction(
	runtime: Runtime,
	scope: ScopeKey,
	fields: Fields,
): Promise<unknown> {
	if (fields.action === "compact") {
		const job = await prepareCompact(runtime, scope, {
			scopeKeys: runtime.scopes,
		});
		return {
			inputs: job.inputs,
			job: job.job,
			copies: job.published - job.joined,
			joins: job.joined,
		};
	}
	const answers = parseAnswers(text(fields, "answers"));
	const copied = Array.isArray(fields.inputs)
		? (fields.inputs as readonly BuildInput[])
		: null;
	if (!copied)
		throw new MemlensError("Usage", "The answer needs copied inputs.");
	const { built, rejected } = await applyAnswers(
		runtime,
		scope,
		answers,
		copied,
	);
	return { built, rejected: rejected.length, rejectedRanges: rejected };
}
// #endregion FUNC_compactAction
