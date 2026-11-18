/**
 * #region moduleContract
 * @purpose Draw the memory page of the harness window, so a human reads and changes the records of
 *   each profile of the base file with no session.
 * @scope The head line, the profile control, the scope control, the screen bar, the screen body,
 *   the record dialog, the status line, and the stylesheet. NOT: the slot registration, the
 *   transport, the store, and the session tab.
 * @invariants The page holds one console for the profiles of the base file, and the console starts
 *   on the default profile.
 * @invariants The page reads and writes no page address and no history. The address stays in memory.
 * @invariants The page renders the stylesheet in a `style` element, so the CSS leaves with the page.
 * @invariants A store that is not open gives the stated error in the body. The page probes the host
 *   at each retry, and the view load replaces that error when the store opens.
 * @dependencies USES API: @memlens/ui, react
 * @keywords client, page, panel, memory, profile, screen, scope, dialog, status
 * #endregion moduleContract
 */

import type { Table, Translate } from "@memlens/ui";
import {
	DEFAULT_ROUTE,
	NoteDialog,
	SCREEN_COMPONENTS,
	SCREENS,
} from "@memlens/ui";
import type { JSX } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createProfileConsole, RETRY_MS, retryNeeded } from "./console.js";
import { CONSOLE_CSS } from "./styles.js";

// #region TYPE_MemoryPageProps
/**
 * @purpose Hold the translate function of the page and its title.
 * @invariants The message key space is the table of the console, so each screen control uses it.
 * @invariants The title is the name of the panel, so the head and the sidebar row agree.
 */
export type MemoryPageProps = {
	readonly t: Translate;
	readonly title: string;
};
// #endregion TYPE_MemoryPageProps

// #region COMPONENT_MemoryPage
/**
 * @purpose Hold one console of the base file profiles and draw its controls and its screen.
 * @invariants The console starts once per mount. The first restore reads the default profile.
 * @invariants The profile control follows the resolved profile of the view.
 * @invariants The scope control follows the resolved scope of the view, and a choice of it opens
 *   that scope.
 * @invariants The status line states a failed call. A store that is not open also holds one stated
 *   line, which stays until the store opens.
 */
export function MemoryPage({ t, title }: MemoryPageProps): JSX.Element {
	const [api] = useState(() => createProfileConsole(t));
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
	const Screen = SCREEN_COMPONENTS[state.screen];
	const scopes = model?.scopes ?? [];
	const selected = state.profile || model?.profile || "";
	const names = model?.profiles.length
		? model.profiles
		: [selected].filter(Boolean);
	const profile = names.includes(selected) ? selected : (names[0] ?? "");
	const selectedScope = scopes.some((item) => item.key === state.scope)
		? state.scope
		: (scopes[0]?.key ?? "");
	return (
		<div className="ml-console ml-page">
			<style>{CONSOLE_CSS}</style>
			<div className="ml-head">
				<span className="ml-title">{title}</span>
				<label className="ml-field">
					<span className="ml-bar-title">{t("profile")}</span>
					<select
						value={profile}
						onChange={(event) => {
							void api.call.setProfile(event.target.value);
						}}
					>
						{names.map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</select>
				</label>
				{scopes.length ? (
					<label className="ml-field ml-scope-field">
						<span className="ml-bar-title">{t("scopes")}</span>
						<select
							value={selectedScope}
							onChange={(event) => {
								void api.call.reset(event.target.value);
							}}
						>
							{scopes.map((scope) => (
								<option key={scope.key} value={scope.key}>
									{scope.key}
								</option>
							))}
						</select>
					</label>
				) : null}
				<span className="ml-hspacer" />
				<button
					type="button"
					className="ml-new"
					onClick={() => {
						api.call.newNote();
					}}
				>
					{t("newRecord")}
				</button>
			</div>
			<nav className="ml-bar" aria-label={t("screens")}>
				{SCREENS.map((screen, index) => (
					<button
						key={screen}
						type="button"
						className={screen === state.screen ? "ml-screen on" : "ml-screen"}
						aria-current={screen === state.screen ? "page" : undefined}
						onClick={() => {
							api.call.navigate(screen);
						}}
					>
						{t(`nav${index}` as keyof Table)}
					</button>
				))}
			</nav>
			<div className="ml-body">
				{unavailable ? (
					<div className="status error" role="status" aria-live="polite">
						{`${t("store")}: ${state.runtime?.store?.error ?? ""}`}
					</div>
				) : null}
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
// #endregion COMPONENT_MemoryPage
