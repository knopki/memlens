/**
 * #region moduleContract
 * @purpose Guard the search, review, and proposals screens and the record dialog against a crash, a
 * lost text, and a lost class hook.
 * @scope The three screens and the note dialog.
 * @invariants Each surface renders from one fixed console state and one fixed api.
 * @keywords test, screen, search, review, proposal, dialog, markup, class
 * #endregion moduleContract
 */

import type { DueRecord, IndexHit, Proposal } from "@memlens/core";
import { NOTE_KINDS } from "@memlens/core/view";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoteDialog } from "../../src/components/note-dialog.js";
import { Proposals } from "../../src/components/screens/proposals.js";
import { Review } from "../../src/components/screens/review.js";
import { Search } from "../../src/components/screens/search.js";
import { fill, KIND_KEYS, messages } from "../../src/i18n.js";
import type {
	ConsoleActions,
	ConsoleApi,
	ConsoleState,
	DialogState,
	Translate,
} from "../../src/model/console.js";
import type { View } from "../../src/types.js";

/** One hit of the search. */
const HIT: IndexHit = {
	addr: "project:alpha#0",
	scope: "project:alpha",
	pos: 0,
	id: "01JAZ5S0V0S9Z3H7Y8F4W6Q2P1",
	ts: "2026-11-01T10:00:00Z",
	kind: "fact",
	body: "the alpha note",
	longformChars: 0,
	review_at: null,
};

/** One note of the due list. */
const DUE: DueRecord = {
	addr: "project:alpha#1",
	scope: "project:alpha",
	pos: 1,
	ts: "2026-11-01T11:00:00Z",
	kind: "task",
	body: "the due note",
	review_at: "2026-11-02T12:00:00Z",
};

/** One note of the next list. */
const NEXT: DueRecord = {
	...DUE,
	addr: "project:alpha#2",
	pos: 2,
	body: "the next note",
	review_at: "2026-12-01T12:00:00Z",
};

/** One proposal that waits for a human. */
const PROPOSAL: Proposal = {
	id: "01JAZ5S0V0S9Z3H7Y8F4W6Q2P2",
	scope: "project:alpha",
	op: "note",
	target: null,
	payload: "the waiting payload",
	created_at: "2026-11-01T10:00:00Z",
	expires_at: "2026-12-01T10:00:00Z",
	status: "open",
};

/** The open dialog of a new note. */
const CREATE_NOTE: DialogState = {
	mode: "create",
	target: "",
	body: "the alpha note",
	longform: "the doc",
	scope: "project:alpha",
	kind: "note",
	supersedes: "",
	links: [],
};

/** The open dialog of an amendment. */
const AMEND_NOTE: DialogState = {
	mode: "amend",
	target: "project:alpha#1",
	body: "the due note",
	longform: "",
	scope: "project:alpha",
	kind: "task",
	supersedes: "",
	links: [],
};

// #region FUNC_viewOf
/**
 * @purpose Build one console view with one search hit, two review notes, and one proposal.
 */
function viewOf(patch: Partial<View> = {}): View {
	return {
		profile: "default",
		scope: "project:alpha",
		scopes: [
			{
				key: "project:alpha",
				total: 3,
				live: 3,
				hidden: 0,
				deleted: 0,
			},
		],
		review: [DUE],
		reviewTotal: 1,
		reviewNext: [NEXT],
		reviewNextTotal: 4,
		reviewPolicy: {
			decision: 7,
			preference: 30,
			fact: 30,
			gotcha: 30,
			task: 7,
			note: 30,
		},
		proposals: [PROPOSAL],
		allowDelete: true,
		profiles: ["default"],
		path: "/tmp/memlens.db",
		backend: "fake",
		revision: "rev-1",
		...patch,
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
		screen: "search",
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
 * @invariants The api records no call. The test renders the surfaces only.
 */
function apiOf(state: ConsoleState): ConsoleApi {
	const call = {
		openTarget: () => Promise.resolve(),
		openInTree: () => Promise.resolve(),
		search: () => Promise.resolve(),
		reload: () => Promise.resolve(),
		action: () => Promise.resolve(),
		editNote: () => Promise.resolve(),
		closeDialog: () => {},
		saveDialog: () => Promise.resolve(),
	} as unknown as ConsoleActions;
	const t: Translate = (key, values = {}) => fill(messages("en")[key], values);
	return { state, subscribe: () => () => {}, t, call };
}
// #endregion FUNC_apiOf

describe("search screen", () => {
	it("offers each kind of the store as one toggle", () => {
		const markup = renderToStaticMarkup(
			<Search api={apiOf(stateOf({ kinds: ["task"] }))} />,
		);
		const en = messages("en");
		for (const kind of NOTE_KINDS) {
			const label = en[KIND_KEYS[kind]];
			const on = kind === "task";
			expect(markup).toContain(
				`<button type="button" class="btn${on ? " on" : ""}" aria-pressed="${on}">${label}</button>`,
			);
		}
	});

	it("shows the words, the filters, and the hit row", () => {
		const markup = renderToStaticMarkup(
			<Search
				api={apiOf(
					stateOf({
						query: "alpha",
						searchScope: "project:alpha",
						hits: [HIT],
					}),
				)}
			/>,
		);
		expect(markup).toContain("Find notes by words.");
		expect(markup).toContain('class="searchbar"');
		expect(markup).toContain('class="filters"');
		expect(markup).toContain("<span>scope</span>");
		expect(markup).toContain("<span>kind</span>");
		expect(markup).toContain("<span>since</span>");
		expect(markup).toContain("<span>until</span>");
		expect(markup).toContain("<span>due for review</span>");
		expect(markup).toContain('type="checkbox"');
		expect(markup).toContain("<span>limit</span>");
		expect(markup).toContain('<option value="project:alpha" selected="">');
		expect(markup).toContain(">Find</button>");
		expect(markup).toContain('<span class="t">1 matches</span>');
		expect(markup).toContain('<span class="r">project:alpha</span>');
		expect(markup).toContain('class="btn line hit"');
		expect(markup).toContain(
			'<span class="id"><span class="scope">project:alpha</span><span class="pos">#0</span></span>',
		);
		expect(markup).toContain('<span class="kind">fact</span>');
		expect(markup).toContain(
			'<span class="tx">the <mark>alpha</mark> note</span>',
		);
		expect(markup).toContain('<span class="when">2026-11-01</span>');
		expect(markup).toContain('class="split"');
		expect(markup).toContain('<span class="t">Inspector</span>');
		expect(markup).toContain('<p class="muted">Select a line.</p>');
	});

	it("keeps the body text and states the empty list", () => {
		const markup = renderToStaticMarkup(
			<Search api={apiOf(stateOf({ query: "alpha" }))} />,
		);
		expect(markup).toContain('<p class="muted">No matches.</p>');
		expect(markup).toContain('<span class="t">0 matches</span>');
	});
});

describe("review screen", () => {
	it("shows the two tables, the record actions, and the periods", () => {
		const markup = renderToStaticMarkup(
			<Review api={apiOf(stateOf({ screen: "review" }))} />,
		);
		expect(markup).toContain("The notes with a review time of now");
		expect(markup).toContain('<span class="t">Due</span>');
		expect(markup).toContain('<span class="r">1 / 1</span>');
		expect(markup).toContain('<span class="r">1 / 4</span>');
		expect(markup).toContain("<th>Address</th>");
		expect(markup).toContain("<th>Review date</th>");
		expect(markup).toContain("<th>Actions</th>");
		expect(markup).toContain('<button type="button" class="btn">');
		expect(markup).toContain("project:alpha#1</button>");
		expect(markup).toContain("the due note");
		expect(markup).toContain("<td>task</td>");
		expect(markup).toContain("<td>2026-11-02</td>");
		expect(markup).toContain('class="actions"');
		expect(markup).toContain(">Reviewed</button>");
		expect(markup).toContain(">Amend</button>");
		expect(markup).toContain(">Supersede</button>");
		expect(markup).toContain(">Forget</button>");
		expect(markup).toContain('class="btn danger">Delete</button>');
		expect(markup).toContain('<span class="t">Review periods</span>');
		expect(markup).toContain("<b>task</b><span>7 days</span>");
	});

	it("shows no periods panel without a policy", () => {
		const { reviewPolicy: _policy, ...model } = viewOf();
		const markup = renderToStaticMarkup(
			<Review api={apiOf(stateOf({ model, screen: "review" }))} />,
		);
		expect(markup).not.toContain("Review periods");
		expect(markup).toContain('<span class="t">Due</span>');
	});

	it("disables the delete action without a permission and states an empty table", () => {
		const markup = renderToStaticMarkup(
			<Review
				api={apiOf(
					stateOf({
						model: viewOf({ allowDelete: false, review: [] }),
						screen: "review",
					}),
				)}
			/>,
		);
		expect(markup).toContain('class="btn danger" disabled="">Delete</button>');
		expect(markup).toContain('<p class="muted">none</p>');
	});
});

describe("proposals screen", () => {
	it("shows the waiting proposal and its two decisions", () => {
		const markup = renderToStaticMarkup(
			<Proposals api={apiOf(stateOf({ screen: "proposals" }))} />,
		);
		expect(markup).toContain("A proposal waits for a human.");
		expect(markup).toContain('<span class="t">Waiting</span>');
		expect(markup).toContain('<span class="r">1</span>');
		expect(markup).toContain("<th>Decision</th>");
		expect(markup).toContain("<td>01JAZ5S0V0S9Z3H7Y8F4W6Q2P2</td>");
		expect(markup).toContain("<td>the waiting payload</td>");
		expect(markup).toContain("<td>project:alpha</td>");
		expect(markup).toContain('<button type="button" class="btn pri">');
		expect(markup).toContain(">Accept</button>");
		expect(markup).toContain(">Dismiss</button>");
	});

	it("lists only the proposals of the view scope", () => {
		const other: Proposal = {
			...PROPOSAL,
			id: "01JAZ5S0V0S9Z3H7Y8F4W6Q2P9",
			scope: "user:notes",
			payload: "the foreign payload",
		};
		const markup = renderToStaticMarkup(
			<Proposals
				api={apiOf(
					stateOf({
						screen: "proposals",
						model: viewOf({ proposals: [PROPOSAL, other] }),
					}),
				)}
			/>,
		);
		expect(markup).toContain("<td>the waiting payload</td>");
		expect(markup).not.toContain("the foreign payload");
		expect(markup).toContain('<span class="r">1</span>');
		expect(markup).toContain('<p class="muted">In other scopes: 1</p>');
	});

	it("states the count of the other scopes with an empty table", () => {
		const other: Proposal = {
			...PROPOSAL,
			id: "01JAZ5S0V0S9Z3H7Y8F4W6Q2P9",
			scope: "user:notes",
		};
		const markup = renderToStaticMarkup(
			<Proposals
				api={apiOf(
					stateOf({
						screen: "proposals",
						model: viewOf({ proposals: [other] }),
					}),
				)}
			/>,
		);
		expect(markup).toContain('<span class="r">0</span>');
		expect(markup).toContain('<p class="muted">In other scopes: 1</p>');
	});

	it("states the empty table", () => {
		const markup = renderToStaticMarkup(
			<Proposals api={apiOf(stateOf({ model: viewOf({ proposals: [] }) }))} />,
		);
		expect(markup).toContain('<p class="muted">none</p>');
	});
});

describe("note dialog", () => {
	it("renders nothing without an open dialog", () => {
		expect(renderToStaticMarkup(<NoteDialog api={apiOf(stateOf())} />)).toBe(
			"",
		);
	});

	it("renders the five fields and the two actions of a new note", () => {
		const markup = renderToStaticMarkup(
			<NoteDialog api={apiOf(stateOf({ dialog: CREATE_NOTE }))} />,
		);
		expect(markup).toContain("<dialog");
		expect(markup).toContain('<span class="t">New record</span>');
		expect(markup).toContain('class="field"');
		expect(markup).toContain("the alpha note</textarea>");
		expect(markup).toContain("the doc</textarea>");
		expect(markup).toContain('<div class="counter">14 characters</div>');
		expect(markup).toContain('value="project:alpha"');
		expect(markup).toContain('<option value="note" selected="">note</option>');
		expect(markup).toContain('class="hint">A new scope starts with this note.');
		expect(markup).toContain('class="dlg-note"');
		expect(markup).toContain(">Cancel</button>");
		expect(markup).toContain(">Create record</button>");
	});

	it("shows the amend title and hides the scope hint", () => {
		const markup = renderToStaticMarkup(
			<NoteDialog api={apiOf(stateOf({ dialog: AMEND_NOTE }))} />,
		);
		expect(markup).toContain('<span class="t">Amend note</span>');
		expect(markup).toContain(">Save changes</button>");
		expect(markup).not.toContain('class="hint"');
	});

	it("shows the links of the record as text and takes added addresses only", () => {
		const markup = renderToStaticMarkup(
			<NoteDialog
				api={apiOf(
					stateOf({
						dialog: {
							...AMEND_NOTE,
							links: ["project:alpha#1", "project:alpha#2"],
						},
					}),
				)}
			/>,
		);
		expect(markup).toContain('<span class="tag">project:alpha#1</span>');
		expect(markup).toContain('<span class="tag">project:alpha#2</span>');
		expect(markup).toContain("Record links");
		expect(markup).toContain("Add addresses");
		expect(markup).toContain('class="links"');
	});

	it("blocks the save action while an action runs", () => {
		const markup = renderToStaticMarkup(
			<NoteDialog api={apiOf(stateOf({ dialog: CREATE_NOTE, busy: true }))} />,
		);
		expect(markup).toContain('disabled="">Create record</button>');
	});
});
