/**
 * #region moduleContract
 * @purpose Check the visible text and the class hooks of the maintenance screen, the compaction
 *   panel, and the note inspector.
 * @scope The runtime-present and the runtime-absent path of `Maintenance`, the no-input compaction
 *   job, the answer form, and the empty inspector. NOT: the controller, the transport, and the
 *   stylesheet.
 * @invariants Each test reads the static markup of one component against one fixed state.
 * @invariants The message function is the real English table, so the test reads the user text.
 * @keywords test, maintenance, compaction, inspector, runtime, markup
 * #endregion moduleContract
 */

import type { BuildInput } from "@memlens/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Inspector } from "../../src/components/inspector.js";
import { CompactionPanel } from "../../src/components/screens/compaction.js";
import { Maintenance } from "../../src/components/screens/maintenance.js";
import { fill, messages } from "../../src/i18n.js";
import type {
	ConsoleActions,
	ConsoleApi,
	ConsoleState,
} from "../../src/model/console.js";
import type { Job, View } from "../../src/types.js";
import { entryOf, recordOf, stateOf, viewOf } from "../model/helpers.js";

const noop = async () => undefined;

/** The console actions of a test. No action reaches a host. */
const actions: ConsoleActions = {
	navigate() {},
	restore: noop,
	openTarget: noop,
	openInTree: noop,
	openCatalog: noop,
	openScopeTree: noop,
	search: noop,
	reload: noop,
	reset: noop,
	setProfile: noop,
	action: noop,
	newNote() {},
	editNote: noop,
	closeDialog() {},
	saveDialog: noop,
	prepareCompaction: noop,
	applyCompaction: noop,
	setLanguage() {},
	setTheme() {},
	clearStatus() {},
	watchRuntime() {},
};

/** One console API of a test with the English messages. */
function apiOf(patch: Partial<ConsoleState> = {}): ConsoleApi {
	return {
		state: stateOf(patch),
		subscribe: () => () => undefined,
		t: (key, values = {}) => fill(messages("en")[key], values),
		call: actions,
	};
}

/** One maintenance view with a budget, one node, and one candidate. */
function modelOf(): View {
	return {
		...viewOf("default", "project:alpha", [recordOf("project:alpha", 1)]),
		budgets: {
			here: { used: 4, limit: 10 },
			directions: { used: 2, limit: 8 },
		},
		nodes: [
			{
				scope: "project:alpha",
				node: { level: 1 },
				clean: true,
			},
		],
		candidates: [
			{
				scope: "project:alpha",
				range: { start: 0, level: 1 },
				ready: true,
			},
		],
	} as unknown as View;
}

describe("maintenance screen", () => {
	it("states the budgets and the candidates without a host runtime", () => {
		const markup = renderToStaticMarkup(
			<Maintenance api={apiOf({ model: modelOf() })} />,
		);
		expect(markup).toContain(
			"The tree is a cache over the log. A compaction job publishes summary nodes.",
		);
		expect(markup).toContain('class="tiles"');
		expect(markup).toContain("width:40%");
		expect(markup).toContain("4 / 10 lines");
		expect(markup).toContain("project:alpha#0-1");
		expect(markup).toContain("ready");
		expect(markup).toContain("Nodes by level");
		expect(markup).toContain("Prepare a scope job");
		expect(markup).not.toContain("Host runtime");
	});

	it("states the host runtime fields", () => {
		const markup = renderToStaticMarkup(
			<Maintenance
				api={apiOf({
					model: modelOf(),
					runtime: {
						session: "sess-7",
						materializedAt: "2026-11-14T10:00:00.000Z",
						snapshotSaved: false,
						compaction: {
							attempts: 3,
							active: 1,
							backoffMs: 2000,
							failures: 2,
							dirty: 1,
							provider: "test",
							model: "merge-model",
							lastRunAt: "2026-11-14T10:30:00.000Z",
							nextRunAt: "2026-11-14T11:30:00.000Z",
							lastError: null,
							events: [
								{
									at: "2026-11-14T10:30:00.000Z",
									kind: "retry",
									text: "compaction retry in 10 s",
								},
								{
									at: "2026-11-14T10:31:00.000Z",
									kind: "pass",
									text: "compaction pass: built 2, failed 0",
								},
								{
									at: "2026-11-14T10:31:30.000Z",
									kind: "call",
									text: "compaction call: built 1",
								},
							],
						},
					},
				})}
			/>,
		);
		expect(markup).toContain("Host runtime");
		expect(markup).toContain("sess-7");
		expect(markup).toContain("Snapshot build time");
		expect(markup).toContain("Snapshot saved");
		expect(markup).toContain("not saved");
		expect(markup).toContain("Compaction attempts");
		expect(markup).toContain("Active builds");
		expect(markup).toContain("Backoff time");
		expect(markup).toContain("2 s");
		expect(markup).toContain("Compaction failures");
		expect(markup).toContain("Model route");
		expect(markup).toContain("test/merge-model");
		expect(markup).toContain("Last run");
		expect(markup).toContain("Next run");
		expect(markup).toContain("Dirty ranges");
		expect(markup).toContain("Worker journal");
		expect(markup).toContain("<td>pass</td>");
		expect(markup).toContain("<td>call</td>");
		expect(markup).toContain("compaction call: built 1");
		expect(markup).toContain("compaction pass: built 2, failed 0");
		expect(markup).not.toContain("2026-11-14T10:30:00.000Z");
		expect(markup).not.toContain("2026-11-14T11:00:00.000Z");
	});
});

describe("compaction panel", () => {
	it("states a job without a merge input and opens no answer form", () => {
		const job: Job = {
			inputs: [],
			job: "merge task text",
			profile: "default",
			scope: "project:alpha",
		};
		const markup = renderToStaticMarkup(
			<CompactionPanel api={apiOf({ job })} />,
		);
		expect(markup).toContain("Compaction");
		expect(markup).toContain("Prepare a scope job");
		expect(markup).toContain(
			"No merge input. Every dirty range waits for its second child.",
		);
		expect(markup).not.toContain("<textarea");
		expect(markup).not.toContain("Apply the answers");
	});

	it("shows the answer form of a job with a merge input", () => {
		const job: Job = {
			inputs: [
				{ range: { start: 0, level: 1 }, children: [null, null] } as BuildInput,
			],
			job: "merge task text",
			profile: "other",
			scope: "project:alpha",
		};
		const markup = renderToStaticMarkup(
			<CompactionPanel api={apiOf({ job })} />,
		);
		expect(markup).toContain("merge task text");
		expect(markup).toContain("Answers · #0-1");
		expect(markup).toContain("<textarea");
		expect(markup).toContain('disabled="">Apply the answers');
	});
});

describe("note inspector", () => {
	it("gives no markup without a selection", () => {
		expect(renderToStaticMarkup(<Inspector api={apiOf()} />)).toBe("");
	});

	it("states the note body and the record actions as text", () => {
		const record = recordOf("project:alpha", 1, "decision");
		const model = {
			...viewOf("default", "project:alpha", [record]),
			allowDelete: true,
		} as unknown as View;
		const entry = {
			...entryOf("project:alpha", 1),
			body: "<b>bold</b>",
			longform: "<i>doc</i>",
		};
		const markup = renderToStaticMarkup(
			<Inspector
				api={apiOf({
					model,
					screen: "search",
					selection: { target: entry.addr, result: entry },
				})}
			/>,
		);
		expect(markup).toContain('class="panel ins"');
		expect(markup).toContain('class="quote"');
		expect(markup).toContain("&lt;b&gt;bold&lt;/b&gt;");
		expect(markup).toContain("&lt;i&gt;doc&lt;/i&gt;");
		expect(markup).toContain("Inspector · project:alpha#1");
		expect(markup).toContain("decision");
		expect(markup).toContain("Reviewed");
		expect(markup).toContain("Amend");
		expect(markup).toContain("Supersede");
		expect(markup).toContain("Forget");
		expect(markup).toContain('class="btn danger"');
		expect(markup).toContain("Open in the tree");
	});
});
