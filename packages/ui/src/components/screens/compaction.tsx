/**
 * #region moduleContract
 * @purpose Prepare one compaction job and apply its answers, so a human builds summary nodes
 *   without a host prompt.
 * @scope The prepare button, the job fields, the typed answers, and the apply step.
 *   NOT: the merge rules, the store writes, the address, and the styles.
 * @invariants A job without a merge input states that fact and shows no answer form.
 * @invariants The job text and the answers go into text nodes.
 * @invariants The component holds no style, no transport, and no address.
 * @keywords compaction, job, answer, summary, range, merge, component
 * #endregion moduleContract
 */

import type { JSX } from "react";
import { useState } from "react";
import { renderRange } from "../../model/format.js";
import { Button, Field, Panel, TextArea } from "../primitives.js";
import type { ScreenProps } from "../screen-props.js";

// #region COMPONENT_CompactionPanel
/**
 * @purpose Show the compaction job of this page, or the button that prepares one.
 * @invariants A job without a merge input states that fact and shows no answer form.
 * @invariants A job of another profile or scope shows the apply button as disabled.
 * @invariants The typed answers stay local to the component and clear for a new job.
 */
export function CompactionPanel({ api }: ScreenProps): JSX.Element {
	const { t, state } = api;
	const job = state.job;
	const [typed, setTyped] = useState({ id: "", text: "" });
	const answers = job && typed.id === job.job ? typed.text : "";
	const stale =
		job !== undefined &&
		(job.profile !== state.profile || job.scope !== state.scope);
	return (
		<Panel title={t("compaction")}>
			<div className="actions">
				<Button
					text={t("prepareScope")}
					className="pri"
					onClick={() => {
						void api.call.prepareCompaction();
					}}
				/>
			</div>
			{!job ? null : job.inputs.length === 0 ? (
				<p className="muted">{t("noInputs")}</p>
			) : (
				<>
					<div className="actions" />
					<span className="lbl">{t("mergeTasks")}</span>
					<Button
						text={t("copy")}
						onClick={() => {
							api.call.copy(job.job);
						}}
					/>
					<pre className="slice">{job.job}</pre>
					<Field
						label={`${t("answers")} · ${job.inputs
							.map((input) => renderRange(null, input.range))
							.join(", ")}`}
					>
						<TextArea
							value={answers}
							onChange={(text) => setTyped({ id: job.job, text })}
							rows={5}
							spellCheck={false}
							placeholder={t("answersHint")}
						/>
					</Field>
					<Button
						text={t("applyAnswers")}
						className="pri"
						disabled={stale}
						onClick={() => {
							void api.call.applyCompaction(answers);
						}}
					/>
					<p className="banner" hidden={!state.jobError}>
						{state.jobError}
					</p>
				</>
			)}
		</Panel>
	);
}
// #endregion COMPONENT_CompactionPanel
