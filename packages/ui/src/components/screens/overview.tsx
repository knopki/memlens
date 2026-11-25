/**
 * #region moduleContract
 * @purpose Show each visible scope as one card and the assembled slice below it.
 * @scope The scope card, the counts, and the slice quote. NOT: the open calls, the address, and the
 *   lines of one scope.
 * @invariants Quote the whole slice as text. The slice holds no height limit and no inner scroll.
 * @invariants The slice budget shows only when the read holds it.
 * @keywords overview, scope, card, slice, budget, react
 * #endregion moduleContract
 */

import type { JSX } from "react";
import { useSyncExternalStore } from "react";
import { Button, Panel } from "../primitives.js";
import type { ScreenProps } from "../screen-props.js";

// #region COMPONENT_Overview
/**
 * @purpose Show each visible scope as one card and the assembled slice below.
 * @invariants Keep a card for a scope with no live note. The card reads no line of the scope.
 * @invariants Quote the whole slice as text: the page scrolls, and the slice holds no height limit
 *   and no inner scroll.
 */
export function Overview({ api }: ScreenProps): JSX.Element {
	const state = useSyncExternalStore(
		api.subscribe,
		() => api.state,
		() => api.state,
	);
	const model = state.model;
	if (!model) return <></>;
	return (
		<>
			<p className="sub">{api.t("ovText")}</p>
			<div className="cards">
				{model.scopes.map((item) => {
					const current = item.key === state.scope;
					return (
						<section
							key={item.key}
							className={current ? "card active" : "card"}
						>
							<div className="card-head">
								<span className="key">{item.key}</span>
								{current ? <span className="tag">{api.t("live")}</span> : null}
							</div>
							<div className="stats">
								<span>{`${item.live} ${api.t("live")}`}</span>
								<span>{`${item.hidden} ${api.t("hidden")}`}</span>
								<span>{`${item.deleted} ${api.t("deleted")}`}</span>
							</div>
							<Button onClick={() => void api.call.reset(item.key)}>
								{api.t("openScope")}
							</Button>
						</section>
					);
				})}
			</div>
			<Panel
				title={api.t("slice")}
				right={
					model.budgets
						? api.t("lines", {
								used: model.budgets.here.used,
								limit: model.budgets.here.limit,
							})
						: ""
				}
			>
				<pre className="slice">{model.text ?? ""}</pre>
			</Panel>
		</>
	);
}
// #endregion COMPONENT_Overview
