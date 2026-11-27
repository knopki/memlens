/**
 * #region moduleContract
 * @purpose Hold the standalone shell to the chrome that the stylesheet and the DOM console expect,
 * so the shared screens reach a human through one header, rail, screen, and footer.
 * @scope The header pickers, the rail, the heading, the main element, the footer, and the status
 * line.
 * @invariants Each test renders one fixed console state and one fixed api.
 * @keywords test, shell, standalone, header, rail, heading, footer, status
 * #endregion moduleContract
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fill, messages } from "../../src/i18n.js";
import type {
	ConsoleActions,
	ConsoleApi,
	ConsoleState,
	Translate,
} from "../../src/model/console.js";
import { App } from "../../src/standalone/app.js";
import type { View } from "../../src/types.js";

// #region FUNC_viewOf
/**
 * @purpose Build one console view of one screen, with two profiles and two scopes.
 * @param patch - The fields that the test changes.
 */
function viewOf(patch: Partial<View> = {}): View {
	return {
		screen: "overview",
		profile: "default",
		scope: "project:alpha",
		scopes: [
			{
				key: "project:alpha",
				total: 1,
				live: 1,
				hidden: 0,
				deleted: 0,
			},
			{
				key: "project:beta",
				total: 0,
				live: 0,
				hidden: 0,
				deleted: 0,
			},
		],
		revision: "abcdef1234567890",
		text: "# project:alpha",
		budgets: {
			here: { used: 1, limit: 10 },
			directions: { used: 0, limit: 10 },
		},
		frontier: [],
		catalog: [],
		catalogScopes: ["project:alpha", "project:beta"],
		profiles: ["default", "work"],
		path: "/tmp/memlens.db",
		backend: "sqlite",
		allowDelete: false,
		...patch,
	};
}
// #endregion FUNC_viewOf

// #region FUNC_stateOf
/**
 * @purpose Build one console state from the fixed view and an optional patch.
 * @invariants The model is the payload of the state screen, as the host answers it.
 * @param patch - The fields that the test changes.
 */
function stateOf(patch: Partial<ConsoleState> = {}): ConsoleState {
	const screen = patch.screen ?? "overview";
	return {
		model: viewOf({ screen }),
		profile: "default",
		scope: "project:alpha",
		screen,
		lang: "en",
		theme: "system",
		busy: false,
		generation: 1,
		selection: undefined,
		hits: [],
		query: "",
		kinds: [],
		since: "",
		until: "",
		due: false,
		limit: "10",
		searchScope: null,
		reviewKind: "",
		job: undefined,
		jobError: "",
		status: { text: "", error: false },
		dialog: null,
		...patch,
	};
}
// #endregion FUNC_stateOf

// #region FUNC_apiOf
/**
 * @purpose Build one console api from a fixed state and the English message table.
 * @invariants The api holds no transport and calls no action during a render.
 */
function apiOf(state: ConsoleState): ConsoleApi {
	const t: Translate = (key, values = {}) => fill(messages("en")[key], values);
	return {
		state,
		subscribe: () => () => {},
		t,
		call: {} as unknown as ConsoleActions,
	};
}
// #endregion FUNC_apiOf

describe("standalone shell", () => {
	it("draws the chrome and the heading of the current screen", () => {
		const markup = renderToStaticMarkup(<App api={apiOf(stateOf())} />);

		expect(markup).toContain('<div class="shell">');
		expect(markup).toContain("<header>");
		expect(markup).toContain('<div class="brand"><b>memlens</b></div>');
		expect(markup).toContain(
			'<span class="pill"><span class="k">Profile</span><select id="profile">',
		);
		expect(markup).toContain(
			'<span class="k">Language</span><select id="lang">',
		);
		expect(markup).toContain('<span class="k">Theme</span><select id="theme">');
		expect(markup).toContain(
			'<option value="system" selected="">System</option>',
		);
		expect(markup).toContain('<span class="hspacer"></span>');
		expect(markup).toContain('<div class="budget"><span>1 / 10 lines</span>');
		expect(markup).toContain(">New record</button>");
		expect(markup).toContain('<div class="layout">');
		expect(markup).toContain('<main id="main" tabindex="-1">');
		expect(markup).toContain("<h1>Overview</h1>");
		expect(markup).toContain(
			"<footer><span>Store: /tmp/memlens.db</span><span>Revision: abcdef123456</span><span>Backend: sqlite</span></footer>",
		);
	});

	it("marks the live screen and the live scope", () => {
		const markup = renderToStaticMarkup(<App api={apiOf(stateOf())} />);

		expect(markup).toContain(
			'<button type="button" class="btn nav on" aria-current="page">',
		);
		expect(markup.match(/class="btn nav"/g)).toHaveLength(6);
		expect(markup).toContain('<button type="button" class="btn sc on">');
		expect(markup).toContain('<button type="button" class="btn sc">');
		expect(markup).toContain('<nav aria-label="Screens">');
	});

	it("shows the status line and no dialog", () => {
		const markup = renderToStaticMarkup(
			<App
				api={apiOf(stateOf({ status: { text: "Loading…", error: false } }))}
			/>,
		);

		expect(markup).toContain(
			'<div id="status" role="status" aria-live="polite" class="">Loading…</div>',
		);
		expect(markup).not.toContain("<dialog");
	});

	it("adds the scope to the tree heading and holds one inspector", () => {
		const markup = renderToStaticMarkup(
			<App api={apiOf(stateOf({ screen: "tree" }))} />,
		);

		expect(markup).toContain("<h1>Tree · project:alpha</h1>");
		expect(markup.match(/<span class="t">Inspector<\/span>/g)).toHaveLength(1);
	});

	it("shows the loading text while the model is the payload of another screen", () => {
		const markup = renderToStaticMarkup(
			<App
				api={apiOf(
					stateOf({
						screen: "catalog",
						model: viewOf({ screen: "tree" }),
					}),
				)}
			/>,
		);

		expect(markup).toContain('<p class="muted">Loading…</p>');
		expect(markup).not.toContain('<div class="split keys">');
	});

	it("shows the status line only before the first view", () => {
		const markup = renderToStaticMarkup(
			<App
				api={apiOf(
					stateOf({
						model: undefined,
						status: { text: "Loading…", error: false },
					}),
				)}
			/>,
		);

		expect(markup).toBe(
			'<div id="status" role="status" aria-live="polite" class="">Loading…</div>',
		);
	});
});
