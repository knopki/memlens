/**
 * #region moduleContract
 * @purpose Show each pending proposal with its session, scope, age, and decision, so a human
 * accepts or dismisses it from one table.
 * @scope The proposal table and its two decisions. NOT: the proposal store rules, the transport,
 * and the stylesheet.
 * @invariants The payload text goes into a text node. The session column reads the session of the
 *   payload, and a payload without one shows the empty message.
 * @invariants A decision calls the API intent and holds no state of its own.
 * @invariants The table lists the proposals of the view scope only, so the list follows the
 *   selected scope. A line below the table states the count of the other scopes.
 * @keywords proposal, waiting, accept, dismiss, decision, react
 * #endregion moduleContract
 */

import type { Proposal } from "@memlens/core";
import type { JSX } from "react";
import { useSyncExternalStore } from "react";
import type { ConsoleApi, Translate } from "../../model/console.js";
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

// #region FUNC_sessionOf
/**
 * @purpose Give the session of one proposal, or the empty message when the payload holds none.
 * @invariants A payload that is not a JSON object gives the empty message.
 */
function sessionOf(t: Translate, item: Proposal): string {
	try {
		const payload: unknown = JSON.parse(item.payload);
		const session =
			typeof payload === "object" && payload !== null
				? (payload as { session?: unknown }).session
				: undefined;
		return typeof session === "string" && session !== "" ? session : t("none");
	} catch {
		return t("none");
	}
}
// #endregion FUNC_sessionOf

// #region COMPONENT_Proposals
/**
 * @purpose Show each pending proposal of the view scope with its decision.
 * @invariants The table states the count of its rows. An empty table states that fact.
 * @invariants A proposal of another scope stays out of the table, and a line below the table
 *   states its count.
 */
export function Proposals({ api }: ScreenProps): JSX.Element | null {
	const state = useSyncExternalStore(
		api.subscribe,
		() => api.state,
		() => api.state,
	);
	const model = state.model;
	if (!model) return null;
	const t = api.t;
	const all = model.proposals ?? [];
	const proposals = all.filter((item) => item.scope === model.scope);
	const foreign = all.length - proposals.length;
	return (
		<>
			<p className="sub">{t("propText")}</p>
			<Panel title={t("waiting")} right={String(proposals.length)}>
				<Table
					headers={[
						t("id"),
						t("session"),
						t("text"),
						t("scope"),
						t("decision"),
					]}
					rows={proposals.map((item) => [
						item.id,
						sessionOf(t, item),
						item.payload,
						item.scope,
						<Decision key={item.id} api={api} item={item} />,
					])}
					empty={t("none")}
				/>
				{foreign > 0 ? (
					<p className="muted">{t("otherScopes", { count: foreign })}</p>
				) : null}
			</Panel>
		</>
	);
}
// #endregion COMPONENT_Proposals
