/**
 * #region moduleContract
 * @purpose Show each visible scope as one card and the assembled slice below it.
 * @scope The scope card, the counts, the first frontier lines, and the slice quote. NOT: the open
 * calls and the address.
 * @invariants Keep a card for a scope with no live note.
 * @invariants Quote the whole slice as text. The slice holds no height limit and no inner scroll.
 * @dependencies USES: the button and panel primitives and the console api.
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
 * @invariants Keep a card for a scope with no live note. Quote the whole slice as text: the page
 * scrolls, and the slice holds no height limit and no inner scroll.
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
					const lines = item.frontier.split("\n").filter(Boolean);
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
							<div className="mini">
								{lines.length ? (
									lines.slice(0, 3).map((text, index) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: a frontier line holds no identity
										<div key={index}>{text}</div>
									))
								) : (
									<div className="muted">{api.t("noFrontier")}</div>
								)}
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
				right={api.t("lines", {
					used: model.budgets.here.used,
					limit: model.budgets.here.limit,
				})}
			>
				<pre className="slice">{model.text}</pre>
			</Panel>
		</>
	);
}
// #endregion COMPONENT_Overview
