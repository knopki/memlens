/**
 * #region moduleContract
 * @purpose Draw the memory tab of one session, so a human reads and changes the memory of the
 *   session that owns the tab.
 * @scope The tab bar, the current screen, the record dialog, the status line, and the tab CSS.
 * NOT: the slot registration, the transport, the store, and the host route.
 * @invariants The tab takes its session id and its translate function from the slot props.
 * @invariants The tab reads and writes no page address and no history. The address stays in memory.
 * @invariants The tab renders the stylesheet in a `style` element, so the CSS leaves with the tab.
 * @invariants A session change mounts a new console, so no state of the old session stays.
 * @dependencies USES: the screen registry, the record dialog, the tab console, and the tab CSS.
 * @keywords client, tab, view, memory, session, bar, screen, status
 * #endregion moduleContract
 */

import type { JSX } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { NoteDialog } from "../../../ui/src/components/note-dialog.js";
import { SCREEN_COMPONENTS } from "../../../ui/src/components/screens/index.js";
import type { Table } from "../../../ui/src/i18n.js";
import type { Translate } from "../../../ui/src/model/console.js";
import { DEFAULT_ROUTE, SCREENS } from "../../../ui/src/route.js";
import { createTabConsole } from "./console.js";
import { TAB_CSS } from "./styles.js";

// #region TYPE_MemoryViewProps
/**
 * @purpose Hold the two values that the slot inject gives the tab.
 * @invariants The id names the session of the tab. The translate function gives the tab language.
 */
export type MemoryViewProps = {
	readonly sessionId: string;
	readonly t: Translate;
};
// #endregion TYPE_MemoryViewProps

// #region COMPONENT_MemoryView
/**
 * @purpose Draw the memory tab of one session.
 * @invariants A session change remounts the console, so no state of the old session stays.
 * @param props - The session id and the translate function of the tab.
 */
export function MemoryView({ sessionId, t }: MemoryViewProps): JSX.Element {
	return <ConsoleTab key={sessionId} sessionId={sessionId} t={t} />;
}
// #endregion COMPONENT_MemoryView

// #region COMPONENT_ConsoleTab
/**
 * @purpose Hold one console and draw its bar, its screen, its dialog, and its status.
 * @invariants The console starts once per mount. The first restore reads the view of the session.
 * @invariants The bar lists the scopes of the view and the seven screen names.
 * @invariants The status line is the only place for a failed call.
 */
function ConsoleTab({ sessionId, t }: MemoryViewProps): JSX.Element {
	const [api] = useState(() => createTabConsole(sessionId, t));
	const state = useSyncExternalStore(
		api.subscribe,
		() => api.state,
		() => api.state,
	);
	useEffect(() => {
		void api.call.restore(DEFAULT_ROUTE);
	}, [api]);
	const Screen = SCREEN_COMPONENTS[state.screen];
	const scopes = state.model?.scopes ?? [];
	return (
		<div className="ml-tab">
			<style>{TAB_CSS}</style>
			<div className="ml-bar">
				<span className="ml-bar-title">{t("screens")}</span>
				<div className="ml-screens">
					{SCREENS.map((screen, index) => (
						<button
							key={screen}
							type="button"
							className={screen === state.screen ? "ml-screen on" : "ml-screen"}
							aria-current={screen === state.screen ? "page" : undefined}
							onClick={() => api.call.navigate(screen)}
						>
							{t(`nav${index}` as keyof Table)}
						</button>
					))}
				</div>
				{scopes.length ? (
					<>
						<span className="ml-bar-title">{t("scopes")}</span>
						<div className="ml-scopes">
							{scopes.map((scope) => (
								<button
									key={scope.key}
									type="button"
									className={
										scope.key === state.scope ? "ml-scope on" : "ml-scope"
									}
									onClick={() => void api.call.reset(scope.key)}
								>
									{scope.key}
								</button>
							))}
						</div>
					</>
				) : null}
				<button
					type="button"
					className="ml-new"
					onClick={() => api.call.newNote()}
				>
					{t("newRecord")}
				</button>
			</div>
			<div className="ml-body">
				<Screen api={api} />
			</div>
			<div
				className={state.status.error ? "status error" : "status"}
				role="status"
				aria-live="polite"
			>
				{state.status.text}
			</div>
			<NoteDialog api={api} />
		</div>
	);
}
// #endregion COMPONENT_ConsoleTab
