/**
 * #region moduleContract
 * @purpose Draw the page of the standalone console, so the shared component layer reaches a human
 * through one shell with the header, the rail, the screen, and the status line.
 * @scope The chrome, the heading, the seven navigation keys, the theme attribute, the page text,
 * the browser history listener, the dialog, and the status line. NOT: the screens, the store, the
 * transport, and the stylesheet.
 * @invariants The shell writes no markup that the screens already write.
 * @invariants The shell emits the class names of the stylesheet of the standalone host.
 * @invariants A page without a model shows the status line only, as the DOM console did.
 * @invariants The tree screen and the search screen hold the inspector. The shell adds no second
 * inspector.
 * @usecases
 *  - Screen: human => presses a number key => gets the screen of that key
 *  - Theme: human => selects the system theme => gets the palette of the system setting
 * @keywords shell, standalone, chrome, rail, header, footer, shortcut, theme, status
 * #endregion moduleContract
 */

import type { JSX } from "react";
import { useEffect, useSyncExternalStore } from "react";
import { NoteDialog } from "../components/note-dialog.js";
import {
	Button,
	Chip,
	Icon,
	Meter,
	Select,
	StatusLine,
} from "../components/primitives.js";
import { SCREEN_COMPONENTS } from "../components/screens/index.js";
import { LANG_NAMES, LANGS, type Table } from "../i18n.js";
import type { ConsoleApi } from "../model/console.js";
import { SCREENS } from "../route.js";
import type { View } from "../types.js";
import { readAddress, watchAddress } from "./address.js";
import { applyTheme, watchSystemTheme } from "./theme.js";

/** The glyph of each screen, in the order of the rail. */
const ICONS = [
	"M2 3h12M2 8h12M2 13h7",
	"M8 14V9M8 9L4 6M8 9l4-3M4 6V3M12 6V3",
	"M2 12l3-5 3 2 3-6 3 3",
	"M10.2 10.2L14 14M6 3a4.2 4.2 0 100 8.4A4.2 4.2 0 006 3z",
	"M3 8l3 3 7-7",
	"M3 4h10M3 8h10M3 12h6",
	"M2 8h3l2-4 2 8 2-4h3",
];

/** The theme choices of the header, with their message key. */
const THEMES = [
	["system", "themeSystem"],
	["light", "themeLight"],
	["dark", "themeDark"],
] as const;

// #region COMPONENT_App
/**
 * @purpose Draw the chrome and the current screen from the state of one console.
 * @invariants The theme attribute and the page text follow the state.
 * @invariants The number keys open the seven screens, unless a dialog is open or a field holds the
 * focus.
 */
export interface AppProps {
	readonly api: ConsoleApi;
}

export function App({ api }: AppProps): JSX.Element {
	const state = useSyncExternalStore(
		api.subscribe,
		() => api.state,
		() => api.state,
	);
	const { lang, theme } = state;

	useEffect(() => {
		document.documentElement.lang = lang;
		document.title = api.t("title");
		const skip = document.querySelector(".skip");
		if (skip) skip.textContent = api.t("skip");
	}, [lang, api]);

	useEffect(() => {
		applyTheme(theme);
		if (theme !== "system") return;
		return watchSystemTheme(() => {
			applyTheme("system");
		});
	}, [theme]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent): void => {
			const next = SCREENS[Number(event.key) - 1];
			if (next === undefined || api.state.dialog) return;
			const tag = document.activeElement?.tagName ?? "";
			if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
			api.call.navigate(next);
		};
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("keydown", onKey);
		};
	}, [api]);

	useEffect(
		() =>
			watchAddress(() => {
				void api.call.restore(readAddress(location.search));
			}),
		[api],
	);

	const model = state.model;
	const status = (
		<StatusLine
			text={state.dialog ? "" : state.status.text}
			error={state.status.error}
		/>
	);
	if (!model) return status;
	const index = SCREENS.indexOf(state.screen);
	const title =
		state.screen === "tree"
			? `${api.t("nav1")} · ${state.scope}`
			: api.t(`nav${index}` as keyof Table);
	const Screen = SCREEN_COMPONENTS[state.screen];
	return (
		<>
			<div className="shell">
				<Header api={api} model={model} />
				<div className="layout">
					<Rail api={api} model={model} />
					<main id="main" tabIndex={-1}>
						<h1>{title}</h1>
						<Screen api={api} />
					</main>
				</div>
				<Footer api={api} model={model} />
			</div>
			{status}
			<NoteDialog api={api} />
		</>
	);
}
// #endregion COMPONENT_App

// #region COMPONENT_Header
/**
 * @purpose Show the profile, the language, the theme, the here budget, and the create action.
 * @invariants The profile list and the dirty count come from the view.
 */
interface HeaderProps {
	readonly api: ConsoleApi;
	readonly model: View;
}

function Header({ api, model }: HeaderProps): JSX.Element {
	const { t } = api;
	const state = api.state;
	return (
		<header>
			<div className="brand">
				<b>memlens</b>
			</div>
			<Chip
				label={t("profile")}
				value={
					<Select
						id="profile"
						value={state.profile}
						options={model.profiles.map((key) => ({ value: key, label: key }))}
						onChange={(value) => {
							void api.call.setProfile(value);
						}}
					/>
				}
			/>
			<Chip
				label={t("language")}
				value={
					<Select
						id="lang"
						value={state.lang}
						options={LANGS.map((code) => ({
							value: code,
							label: LANG_NAMES[code],
						}))}
						onChange={(value) => {
							api.call.setLanguage(value);
						}}
					/>
				}
			/>
			<Chip
				label={t("theme")}
				value={
					<Select
						id="theme"
						value={state.theme}
						options={THEMES.map(([value, key]) => ({
							value,
							label: t(key),
						}))}
						onChange={(value) => {
							api.call.setTheme(value);
						}}
					/>
				}
			/>
			{model.candidates.length ? (
				<Chip
					label={t("dirty")}
					value={String(model.candidates.length)}
					warn={true}
				/>
			) : null}
			<span className="hspacer" />
			<div className="budget">
				<span>
					{t("lines", {
						used: model.budgets.here.used,
						limit: model.budgets.here.limit,
					})}
				</span>
				<Meter
					used={model.budgets.here.used}
					limit={model.budgets.here.limit}
				/>
			</div>
			<Button
				text={t("newRecord")}
				className="pri"
				onClick={() => {
					api.call.newNote();
				}}
			/>
		</header>
	);
}
// #endregion COMPONENT_Header

// #region COMPONENT_Rail
/**
 * @purpose Show the seven screens and the scope list of the view.
 * @invariants The live screen and the live scope take the class on.
 * @invariants The live screen states its place in the navigation.
 */
interface RailProps {
	readonly api: ConsoleApi;
	readonly model: View;
}

function Rail({ api, model }: RailProps): JSX.Element {
	const { t } = api;
	const state = api.state;
	return (
		<aside>
			<div className="rail-title">{t("screens")}</div>
			<nav aria-label={t("screens")}>
				{SCREENS.map((screen, index) => (
					<button
						key={screen}
						type="button"
						className={screen === state.screen ? "btn nav on" : "btn nav"}
						aria-current={screen === state.screen ? "page" : undefined}
						onClick={() => {
							api.call.navigate(screen);
						}}
					>
						<Icon path={ICONS[index] ?? ""} />
						<span>{t(`nav${index}` as keyof Table)}</span>
					</button>
				))}
			</nav>
			<div className="rail-title">{t("scopes")}</div>
			<div className="scopes">
				{model.scopes.map((item) => (
					<Button
						key={item.key}
						text={item.key}
						className={item.key === state.scope ? "sc on" : "sc"}
						onClick={() => {
							void api.call.reset(item.key);
						}}
					/>
				))}
			</div>
		</aside>
	);
}
// #endregion COMPONENT_Rail

// #region COMPONENT_Footer
/**
 * @purpose Show the store path, the revision, and the backend of the view.
 */
interface FooterProps {
	readonly api: ConsoleApi;
	readonly model: View;
}

function Footer({ api, model }: FooterProps): JSX.Element {
	const { t } = api;
	return (
		<footer>
			<span>{`${t("store")}: ${model.path}`}</span>
			<span>{`${t("revision")}: ${model.revision.slice(0, 12)}`}</span>
			<span>{`${t("backend")}: ${model.backend}`}</span>
		</footer>
	);
}
// #endregion COMPONENT_Footer
