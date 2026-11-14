/**
 * #region moduleContract
 * @purpose Show each pending proposal with its session, scope, age, and decision, so a human
 * accepts or dismisses it from one table.
 * @scope The proposal table and its two decisions. NOT: the proposal store rules, the transport,
 * and the stylesheet.
 * @invariants The payload text goes into a text node.
 * @invariants A decision calls the API intent and holds no state of its own.
 * @dependencies USES: the panel, table, and button primitives, the console api, and the message
 * keys.
 * @keywords proposal, waiting, accept, dismiss, decision, react
 * #endregion moduleContract
 */

import type { JSX } from "react";
import { useSyncExternalStore } from "react";
import type { Proposal } from "../../../../core/src/store/types.js";
import type { ConsoleApi } from "../../model/console.js";
import { Button, Panel, Table } from "../primitives.js";
import type { ScreenProps } from "../screen-props.js";

// #region COMPONENT_Decision
/**
 * @purpose Show the accept and dismiss actions of one proposal.
 * @invariants Each action names the proposal of its row.
 */
interface DecisionProps {
	readonly api: ConsoleApi;
	readonly item: Proposal;
}

function Decision({ api, item }: DecisionProps): JSX.Element {
	return (
		<div className="actions">
			<Button
				text={api.t("accept")}
				className="pri"
				onClick={() => void api.call.action("accept", { target: item.id })}
			/>
			<Button
				text={api.t("dismiss")}
				onClick={() => void api.call.action("dismiss", { target: item.id })}
			/>
		</div>
	);
}
// #endregion COMPONENT_Decision

// #region COMPONENT_Proposals
/**
 * @purpose Show each pending proposal with its decision.
 * @invariants The table states the count of its rows. An empty table states that fact.
 */
export function Proposals({ api }: ScreenProps): JSX.Element {
	const state = useSyncExternalStore(
		api.subscribe,
		() => api.state,
		() => api.state,
	);
	const model = state.model;
	if (!model) return <></>;
	const t = api.t;
	return (
		<>
			<p className="sub">{t("propText")}</p>
			<Panel title={t("waiting")} right={String(model.proposals.length)}>
				<Table
					headers={[
						t("id"),
						t("session"),
						t("text"),
						t("scope"),
						t("decision"),
					]}
					rows={model.proposals.map((item) => [
						item.id,
						t("none"),
						item.payload,
						item.scope,
						<Decision key={item.id} api={api} item={item} />,
					])}
					empty={t("none")}
				/>
			</Panel>
		</>
	);
}
// #endregion COMPONENT_Proposals
