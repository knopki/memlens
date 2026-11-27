/**
 * #region moduleContract
 * @purpose Draw the memory state of one session, so a human reads the current slice, the profile,
 *   and the scopes of the session that owns the tab.
 * @scope The head line, the scope list, the slice, the status line, and the stylesheet. NOT: the
 *   slot registration, the transport, the console, and the page.
 * @invariants The tab takes its session id and its translate function from the slot props.
 * @invariants The tab reads and writes no page address and no history. The address stays in memory.
 * @invariants The tab renders the stylesheet in a `style` element, so the CSS leaves with the tab.
 * @invariants A session change mounts a new console, so no state of the old session stays.
 * @invariants The tab shows no screen control. The page holds the screens of the console.
 * @invariants A store that is not open gives the stated error in place of the slice. The tab probes
 *   the host at each retry, and the view load replaces that error when the store opens.
 * @invariants A failed view read gives its text and a retry in place of the slice, so the tab never
 *   waits on a read that ended.
 * @dependencies USES API: @memlens/ui, react
 * @keywords client, tab, view, memory, session, slice, profile, scope, status
 * #endregion moduleContract
 */

import type { Translate } from "@memlens/ui";
import { DEFAULT_ROUTE } from "@memlens/ui";
import type { JSX } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createSessionConsole, RETRY_MS, retryNeeded } from "./console.js";
import { CONSOLE_CSS } from "./styles.js";

// #region TYPE_MemoryViewProps
/**
 * @purpose Hold the two values that the slot inject gives the tab.
 * @invariants The id names the session of the tab. The translate function gives the tab language.
 * @invariants The title is the name of the panel, so the head and the sidebar row agree.
 */
export type MemoryViewProps = {
	readonly sessionId: string;
	readonly t: Translate;
	readonly title: string;
};
// #endregion TYPE_MemoryViewProps

// #region COMPONENT_MemoryView
/**
 * @purpose Draw the memory state of one session.
 * @invariants A session change remounts the console, so no state of the old session stays.
 * @param props - The session id and the translate function of the tab.
 */
export function MemoryView({
	sessionId,
	t,
	title,
}: MemoryViewProps): JSX.Element {
	return (
		<SessionState key={sessionId} sessionId={sessionId} t={t} title={title} />
	);
}
// #endregion COMPONENT_MemoryView

// #region COMPONENT_SessionState
/**
 * @purpose Hold one session console and draw its state.
 * @invariants The console starts once per mount. The first restore reads the state of the session.
 * @invariants The head names the profile of the session.
 * @invariants The status line states a failed call. A store that is not open also holds one stated
 *   line, which stays until the store opens.
 * @invariants A failed view read shows its text and a retry button, and the retry reads the state of
 *   the session again. */
function SessionState({ sessionId, t, title }: MemoryViewProps): JSX.Element {
	const [api] = useState(() => createSessionConsole(sessionId, t));
	const state = useSyncExternalStore(
		api.subscribe,
		() => api.state,
		() => api.state,
	);
	const unavailable = state.runtime?.store?.ready === false;
	const retry = retryNeeded(state);
	useEffect(() => {
		void api.call.restore(DEFAULT_ROUTE);
	}, [api]);
	useEffect(() => {
		if (!retry) return;
		const timer = setInterval(() => {
			void api.call.refresh();
		}, RETRY_MS);
		return () => clearInterval(timer);
	}, [api, retry]);
	const model = state.model;
	const profile = model?.profile || state.profile;
	const scopes = model?.scopes ?? [];
	const failure = state.loadError ? (
		<div className="failure">
			<p>{state.loadError}</p>
			<button
				type="button"
				className="btn"
				onClick={() => {
					void api.call.reload();
				}}
			>
				{t("retry")}
			</button>
		</div>
	) : null;
	return (
		<div className="ml-console ml-session">
			<style>{CONSOLE_CSS}</style>
			<div className="ml-head">
				<span className="ml-title">{title}</span>
				<span className="ml-chip">
					<span className="ml-bar-title">{t("profile")}</span>
					<b>{profile || "—"}</b>
				</span>
			</div>
			{model ? (
				<>
					<div className="ml-scoperow">
						<span className="ml-bar-title">{t("scopes")}</span>
						<div className="ml-scopelist">
							{scopes.length ? (
								scopes.map((scope) => (
									<span
										key={scope.key}
										className={
											scope.key === state.scope
												? "ml-scope-tag on"
												: "ml-scope-tag"
										}
									>
										<span className="k">{scope.key}</span>
										<i>{scope.live}</i>
									</span>
								))
							) : (
								<span className="ml-muted">{t("noFrontier")}</span>
							)}
						</div>
					</div>
					<div className="ml-slice-head">
						<span>{t("slice")}</span>
						<span>
							{model.budgets
								? t("lines", {
										used: model.budgets.here.used,
										limit: model.budgets.here.limit,
									})
								: ""}
						</span>
					</div>
					<pre className="ml-slice">{model.text ?? ""}</pre>
				</>
			) : unavailable ? (
				<div className="status error" role="status" aria-live="polite">
					{`${t("store")}: ${state.runtime?.store?.error ?? ""}`}
				</div>
			) : (
				(failure ?? <p className="ml-muted">{t("loading")}</p>)
			)}
			<div
				className={state.status.error ? "status error" : "status"}
				role="status"
				aria-live="polite"
			>
				{state.status.text}
			</div>
		</div>
	);
}
// #endregion COMPONENT_SessionState
