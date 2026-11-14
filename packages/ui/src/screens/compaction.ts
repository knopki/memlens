/**
 * #region moduleContract
 * @purpose Prepare one compaction job and apply its answers, so a human builds summary nodes
 * without a host prompt.
 * @scope The prepare buttons, the job fields, the answer check, and the apply step. NOT: the merge
 * rules and the store writes.
 * @keywords compaction, job, answer, summary, range, merge
 * #endregion moduleContract
 */

import type { BuildInput } from "../../../core/src/types/tree.js";
import { btn, message } from "../controls.js";
import { el, field, panel } from "../dom.js";
import { rangeId } from "../format.js";
import { action } from "../host.js";
import { repaint } from "../repaint.js";
import { state, tr } from "../state.js";
import type { Job } from "../types.js";

// #region FUNC_compactionPanel
/**
 * @purpose Show the compaction job of this page, or the buttons that prepare one.
 * @invariants The panel states the catalog title when the job covers the catalog. A job without a
 *   merge input states that fact and shows no answer form.
 */
export function compactionPanel(): HTMLElement {
	const node = panel(
		state.job?.catalog
			? `${tr("compaction")} · ${tr("nav2")}`
			: tr("compaction"),
	);
	node.append(compactionButtons());
	const job = state.job;
	if (!job) return node;
	if (!job.inputs.length) {
		node.append(
			el("p", tr(job.catalog ? "noInputsCatalog" : "noInputs"), "muted"),
		);
		return node;
	}
	node.append(...jobFields(job));
	return node;
}
// #endregion FUNC_compactionPanel

// #region FUNC_compactionButtons
/**
 * @purpose Build the two prepare buttons of the compaction panel.
 */
function compactionButtons(): HTMLElement {
	const row = el("div", "", "actions");
	for (const catalog of [false, true])
		row.append(
			btn(
				catalog ? tr("prepareCatalog") : tr("prepareScope"),
				() => prepare(catalog),
				"pri",
			),
		);
	return row;
}
// #endregion FUNC_compactionButtons

// #region FUNC_prepare
/**
 * @purpose Prepare one compaction job and keep it for the answer form.
 */
async function prepare(catalog: boolean): Promise<void> {
	const result = (await action("compact", { catalog })) as {
		inputs: BuildInput[];
		job: string;
	};
	if (!result || !Array.isArray(result.inputs)) throw new Error(tr("badJob"));
	state.job = {
		inputs: result.inputs,
		job: result.job,
		catalog,
		profile: state.profile,
		scope: state.scope,
	};
	state.jobError = "";
	repaint();
}
// #endregion FUNC_prepare

function jobFields(job: Job): HTMLElement[] {
	const tasks = el("pre", job.job, "slice");
	const copy = btn(tr("copy"), async () => {
		await navigator.clipboard.writeText(job.job);
		message(tr("copied"));
	});
	const answers = el("textarea");
	answers.rows = 5;
	answers.spellcheck = false;
	answers.placeholder = tr("answersHint");
	const wanted = job.inputs.map((input) => rangeId(input.range));
	const failure = el("p", state.jobError, "banner");
	if (!state.jobError) failure.hidden = true;
	const apply = btn(
		tr("applyAnswers"),
		() => applyAnswers(job, answers, failure),
		"pri",
	);
	apply.disabled = job.profile !== state.profile || job.scope !== state.scope;
	return [
		el("div", "", "actions"),
		el("span", tr("mergeTasks"), "lbl"),
		copy,
		tasks,
		field(`${tr("answers")} · ${wanted.join(", ")}`, answers),
		apply,
		failure,
	];
}

// #region FUNC_applyAnswers
/**
 * @purpose Apply the answers of one job and state the result of each range.
 * @invariants An answer that names no range of the job fails before the host call. A rejected
 *   answer keeps the job and states each rejected range.
 */
async function applyAnswers(
	job: Job,
	answers: HTMLTextAreaElement,
	failure: HTMLElement,
): Promise<void> {
	const wanted = job.inputs.map((input) => rangeId(input.range));
	try {
		if (!answers.value.trim()) throw new Error(tr("enterAnswers"));
		const unknown = unknownInputs(answers.value, wanted);
		if (unknown.length)
			throw new Error(tr("unknownInput", { inputs: wanted.join(", ") }));
		const result = (await action("compact-answer", {
			catalog: job.catalog,
			inputs: job.inputs,
			answers: answers.value,
		})) as { built: number; rejected: number; rejectedRanges: string[] };
		state.job = result.rejected ? job : undefined;
		state.jobError = result.rejected
			? tr("rejectedRanges", {
					ranges: (result.rejectedRanges ?? []).join(", "),
				})
			: "";
		repaint();
		message(
			result.rejected
				? state.jobError
				: tr("built", { built: result.built, rejected: result.rejected }),
			result.rejected > 0,
		);
	} catch (error) {
		const text = error instanceof Error ? error.message : String(error);
		state.jobError = text;
		failure.textContent = text;
		failure.hidden = false;
		message(text, true);
	}
}
// #endregion FUNC_applyAnswers

function unknownInputs(text: string, wanted: readonly string[]): string[] {
	return text
		.split("\n")
		.map((line) => /^#(\d+)-(\d+):/.exec(line.trim()))
		.filter((match) => match !== null)
		.map((match) => `#${match[1]}-${match[2]}`)
		.filter((id) => !wanted.includes(id));
}
