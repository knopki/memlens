/**
 * #region moduleContract
 * @purpose Guard the three console screens against a crash, a lost text, and a lost class hook.
 * @scope The overview, the tree, and the catalog screens.
 * @invariants Each screen renders from one fixed console state and one fixed api.
 * @keywords test, screen, overview, tree, catalog, markup, class
 * #endregion moduleContract
 */

import type { SliceLine } from "@memlens/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Catalog } from "../../src/components/screens/catalog.js";
import { Overview } from "../../src/components/screens/overview.js";
import { TreeView } from "../../src/components/screens/tree.js";
import { fill, messages } from "../../src/i18n.js";
import type {
	ConsoleActions,
	ConsoleApi,
	ConsoleState,
	Translate,
} from "../../src/model/console.js";
import type { Selection, View } from "../../src/types.js";

/** One note line of the frontier. */
const RECORD: SliceLine = {
	kind: "record",
	pos: 0,
	from: "2026-11-01T00:00:00Z",
	to: "2026-11-01T00:00:00Z",
	body: "first note",
};

/** One clean range line of the frontier. */
const SUMMARY: SliceLine = {
	kind: "summary",
	range: { start: 0, level: 1 },
	from: "2026-11-01T00:00:00Z",
	to: "2026-11-02T00:00:00Z",
	summary: "range summary",
};

/** One temporary line of the frontier. */
const TEMPORARY: SliceLine = {
	kind: "temporary",
	range: { start: 0, level: 2 },
	from: "2026-11-01T00:00:00Z",
	to: "2026-11-03T00:00:00Z",
	text: "assembled range",
};

/** One temporary catalog line over a range with no scope. */
const TEMPORARY_CATALOG: SliceLine = {
	kind: "temporary",
	range: { start: 2, level: 1 },
	from: "2026-11-01T00:00:00Z",
	to: "2026-11-03T00:00:00Z",
	text: "assembled range",
};

// #region FUNC_viewOf
/**
 * @purpose Build one console view with two scopes and three frontier lines.
 */
function viewOf(): View {
	return {
		profile: "default",
		scope: "project:alpha",
		scopes: [
			{
				key: "project:alpha",
				total: 5,
				live: 3,
				hidden: 1,
				deleted: 1,
				frontier: "alpha one\nalpha two\nalpha three\nalpha four",
			},
			{
				key: "project:beta",
				total: 0,
				live: 0,
				hidden: 0,
				deleted: 0,
				frontier: "",
			},
		],
		here: "",
		directions: "",
		text: "# project:alpha\nnote <b>bold</b>",
		budgets: {
			here: { used: 1, limit: 10 },
			directions: { used: 2, limit: 10 },
		},
		records: [
			{ scope: "project:alpha", state: "live" },
			{ scope: "project:alpha", state: "live" },
			{ scope: "project:alpha", state: "deleted" },
		],
		nodes: [],
		candidates: [],
		catalog: [SUMMARY, TEMPORARY_CATALOG],
		catalogScopes: ["project:alpha", "project:beta"],
		frontier: [RECORD, SUMMARY, TEMPORARY],
		review: [],
		reviewNext: [],
		reviewNextTotal: 0,
		revision: "rev-1",
		proposals: [],
		profiles: ["default"],
		path: "/tmp/memlens.db",
		backend: "fake",
		allowDelete: false,
		reviewPolicy: {
			decision: 7,
			preference: 30,
			fact: 30,
			task: 7,
			note: 30,
		},
	} as unknown as View;
}
// #endregion FUNC_viewOf

// #region FUNC_stateOf
/**
 * @purpose Build one console state from the fixed view and an optional patch.
 * @param patch - The fields that the test changes.
 */
function stateOf(patch: Partial<ConsoleState> = {}): ConsoleState {
	return {
		model: viewOf(),
		profile: "default",
		scope: "project:alpha",
		screen: "overview",
		lang: "en",
		theme: "system",
		busy: false,
		generation: 1,
		selection: undefined,
		hits: [],
		query: "",
		kind: "",
		since: "",
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
 * @invariants The api gives the four actions that the screens call. It holds no transport.
 */
function apiOf(state: ConsoleState): ConsoleApi {
	const call = {
		reset: () => Promise.resolve(),
		openTarget: () => Promise.resolve(),
		openCatalog: () => Promise.resolve(),
		openScopeTree: () => Promise.resolve(),
	} as unknown as ConsoleActions;
	const t: Translate = (key, values = {}) => fill(messages("en")[key], values);
	return { state, subscribe: () => () => {}, t, call };
}
// #endregion FUNC_apiOf

/** One selection of the children of a range. */
const childrenSelection: Selection = {
	target: "project:alpha#0-1",
	result: {
		kind: "children",
		children: [
			{
				addr: "project:alpha#0",
				ts_from: "2026-11-01T00:00:00Z",
				ts_to: "2026-11-01T12:00:00Z",
				text: "first child",
				built: true,
				chars: 11,
			},
			{
				addr: "project:alpha#1",
				ts_from: "2026-11-02T00:00:00Z",
				ts_to: "2026-11-02T12:00:00Z",
				text: "",
				built: false,
				chars: 0,
			},
		],
	},
};

/** One selection of the two halves of a catalog range. */
const catalogSelection: Selection = {
	target: "#0-1",
	result: { kind: "catalog", children: [SUMMARY] },
};

describe("overview screen", () => {
	it("shows the scope cards and the slice", () => {
		const markup = renderToStaticMarkup(<Overview api={apiOf(stateOf())} />);
		expect(markup).toContain("The notes and the tree above them.");
		expect(markup).toContain('class="cards"');
		expect(markup).toContain('class="card active"');
		expect(markup).toContain('class="card"');
		expect(markup).toContain('<span class="key">project:alpha</span>');
		expect(markup).toContain('<span class="tag">live</span>');
		expect(markup).toContain("<span>3 live</span>");
		expect(markup).toContain("<span>1 hidden</span>");
		expect(markup).toContain("<span>1 deleted</span>");
		expect(markup).toContain("alpha one");
		expect(markup).toContain("alpha three");
		expect(markup).not.toContain("alpha four");
		expect(markup).toContain('<div class="muted">No live notes.</div>');
		expect(markup).toContain(">Open scope</button>");
		expect(markup).toContain('<span class="t">Assembled slice</span>');
		expect(markup).toContain('<span class="r">1 / 10 lines</span>');
		expect(markup).toContain('<pre class="slice">');
		expect(markup).toContain("&lt;b&gt;bold&lt;/b&gt;");
		expect(markup).not.toContain("<b>bold</b>");
	});
});

describe("tree screen", () => {
	it("shows the frontier, its legend, and the children panel", () => {
		const markup = renderToStaticMarkup(
			<TreeView
				api={apiOf(stateOf({ screen: "tree", selection: childrenSelection }))}
			/>,
		);
		expect(markup).toContain("The frontier of this scope.");
		expect(markup).toContain('<span class="t">Frontier</span>');
		expect(markup).toContain('<span class="r">3 ranges · 2 live notes</span>');
		expect(markup).toContain('<span class="lg r">note</span>');
		expect(markup).toContain('<span class="lg s">summary</span>');
		expect(markup).toContain('<span class="lg t">summary pending</span>');
		expect(markup).toContain('class="split"');
		expect(markup).toContain('class="lines"');
		expect(markup).toContain('class="btn line r"');
		expect(markup).toContain('class="btn line s sel"');
		expect(markup).toContain('class="btn line t pending"');
		expect(markup).toContain('<span class="id">project:alpha#0</span>');
		expect(markup).toContain('<span class="tx">first note</span>');
		expect(markup).toContain('title="range summary"');
		expect(markup).toContain('<div class="quote">range summary</div>');
		expect(markup).not.toContain("No summary yet.");
		expect(markup).toContain('<div class="column">');
		expect(markup).toContain("Children · project:alpha#0-1");
		expect(markup).toContain('<span class="id">project:alpha#1</span>');
		expect(markup).toContain('class="btn line pending"');
		expect(markup).toContain('<span class="tx">2026-11-02</span>');
	});

	it("shows a temporary frontier line in the inspector", () => {
		const selection = { ...childrenSelection, target: "project:alpha#0-3" };
		const markup = renderToStaticMarkup(
			<TreeView api={apiOf(stateOf({ screen: "tree", selection }))} />,
		);
		expect(markup).toContain('<div class="quote">assembled range</div>');
	});

	it("shows a nested range after its parent is closed", () => {
		const model = {
			...viewOf(),
			nodes: [
				{
					scope: "project:alpha",
					clean: true,
					node: { start: 4, level: 1, summary: "nested summary" },
				},
			],
		} as unknown as View;
		const selection = { ...childrenSelection, target: "project:alpha#4-5" };
		const markup = renderToStaticMarkup(
			<TreeView api={apiOf(stateOf({ screen: "tree", model, selection }))} />,
		);
		expect(markup).toContain('<div class="quote">nested summary</div>');
	});

	it("shows the current period of a dirty nested range", () => {
		const model = {
			...viewOf(),
			records: [
				{ scope: "project:alpha", state: "live", pos: 4, ts: "2026-11-03" },
				{ scope: "project:alpha", state: "live", pos: 5, ts: "2026-11-04" },
			],
			nodes: [
				{
					scope: "project:alpha",
					clean: false,
					node: { start: 4, level: 1, summary: "stale summary" },
				},
			],
		} as unknown as View;
		const selection = { ...childrenSelection, target: "project:alpha#4-5" };
		const markup = renderToStaticMarkup(
			<TreeView api={apiOf(stateOf({ screen: "tree", model, selection }))} />,
		);
		expect(markup).toContain('<div class="quote">2026-11-03..04</div>');
		expect(markup).not.toContain("stale summary");
	});

	it("shows the inspector hint when no line is open", () => {
		const markup = renderToStaticMarkup(
			<TreeView api={apiOf(stateOf({ screen: "tree" }))} />,
		);
		expect(markup).toContain('<span class="t">Inspector</span>');
		expect(markup).toContain('<p class="muted">Select a line.</p>');
	});
});

describe("catalog screen", () => {
	it("shows the catalog lines, their legend, and the open range", () => {
		const markup = renderToStaticMarkup(
			<Catalog
				api={apiOf(stateOf({ screen: "catalog", selection: catalogSelection }))}
			/>,
		);
		expect(markup).toContain("A line for each range of visible scopes.");
		expect(markup).toContain('<span class="t">Catalog lines</span>');
		expect(markup).toContain('<span class="r">2 / 10 lines</span>');
		expect(markup).toContain('<span class="lg s">summary</span>');
		expect(markup).toContain('<span class="lg t">summary pending</span>');
		expect(markup).toContain('class="split keys"');
		expect(markup).toContain('class="btn line s sel"');
		expect(markup).toContain('class="btn line t pending"');
		expect(markup).toContain('<span class="id" title="#2-3">#2-3</span>');
		expect(markup).toContain("Children · project:alpha,project:beta");
		expect(markup).toContain('<span class="r">1</span>');
	});

	it("shows the hint when no line is open", () => {
		const markup = renderToStaticMarkup(
			<Catalog api={apiOf(stateOf({ screen: "catalog" }))} />,
		);
		expect(markup).toContain('<span class="t">Children</span>');
		expect(markup).toContain('<p class="muted">Select a line.</p>');
	});
});
