/**
 * #region moduleContract
 * @purpose Draw the memory page of the harness window, so a human reads and changes the records of
 *   each profile of the base file with no session.
 * @scope The head line, the profile control, the screen bar, the scope list, the screen body, the
 *   record dialog, the status line, and the stylesheet. NOT: the slot registration, the transport,
 *   the store, and the session tab.
 * @invariants The page holds one console for the profiles of the base file, and the console starts
 *   on the default profile.
 * @invariants The page reads and writes no page address and no history. The address stays in memory.
 * @invariants The page renders the stylesheet in a `style` element, so the CSS leaves with the page.
 * @dependencies USES: the profile console, the screen registry, the record dialog, and the console
 *   stylesheet.
 * @keywords client, page, panel, memory, profile, screen, scope, dialog, status
 * #endregion moduleContract
 */

import type { JSX } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { NoteDialog } from "../../../ui/src/components/note-dialog.js";
import { SCREEN_COMPONENTS } from "../../../ui/src/components/screens/index.js";
import type { Table } from "../../../ui/src/i18n.js";
import type { Translate } from "../../../ui/src/model/console.js";
import { DEFAULT_ROUTE, SCREENS } from "../../../ui/src/route.js";
import { createProfileConsole } from "./console.js";
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
 * @invariants The status line is the only place for a failed call.
 */
export function MemoryPage({ t, title }: MemoryPageProps): JSX.Element {
	const [api] = useState(() => createProfileConsole(t));
	const state = useSyncExternalStore(
		api.subscribe,
		() => api.state,
		() => api.state,
	);
	useEffect(() => {
		void api.call.restore(DEFAULT_ROUTE);
	}, [api]);
	const model = state.model;
	const Screen = SCREEN_COMPONENTS[state.screen];
	const scopes = model?.scopes ?? [];
	const selected = state.profile || model?.profile || "";
	const names = model?.profiles.length
		? model.profiles
		: [selected].filter(Boolean);
	const profile = names.includes(selected) ? selected : (names[0] ?? "");
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
			{scopes.length ? (
				<div className="ml-scoperow">
					<span className="ml-bar-title">{t("scopes")}</span>
					<div className="ml-scopes">
						{scopes.map((scope) => (
							<button
								key={scope.key}
								type="button"
								className={
									scope.key === state.scope ? "ml-scope on" : "ml-scope"
								}
								onClick={() => {
									void api.call.reset(scope.key);
								}}
							>
								{scope.key}
							</button>
						))}
					</div>
				</div>
			) : null}
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
// #endregion COMPONENT_MemoryPage
