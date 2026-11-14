/**
 * #region moduleContract
 * @purpose Hold the console controller to its visible behaviour: one action at a time, the newest
 * answer, the status time, the stored choices, the dialog path, and the reset rules.
 * @scope The controller actions and the state snapshots. NOT: the markup and the transport.
 * #endregion moduleContract
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BuildInput } from "../../../core/src/types/tree.js";
import type { OpenedTarget } from "../../src/model/console.js";
import { DEFAULT_ROUTE } from "../../src/route.js";
import type { View } from "../../src/types.js";
import {
	deferred,
	entryOf,
	type Harness,
	harness,
	recordOf,
	viewOf,
} from "./helpers.js";

/** The calls of one port method. */
const callsOf = (h: Harness, method: string) =>
	h.calls.filter((call) => call.method === method);

beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(console, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe("console controller guard", () => {
	it("holds one action at a time", async () => {
		const gate = deferred<unknown>();
		const h = harness({ action: () => gate.promise });
		const first = h.call.action("review", { target: "project:alpha#1" });
		expect(h.state().busy).toBe(true);
		await h.call.action("forget", { target: "project:alpha#2" });
		expect(h.state().status).toEqual({ text: "busyAction", error: true });
		expect(callsOf(h, "action")).toHaveLength(1);
		gate.resolve({ ok: true });
		await first;
		expect(h.state().busy).toBe(false);
	});

	it("keeps the view of the newest generation", async () => {
		const older = deferred<View>();
		const newer = deferred<View>();
		let index = 0;
		const h = harness({
			view: () => (index++ === 0 ? older.promise : newer.promise),
		});
		const first = h.call.reload();
		const second = h.call.reload();
		newer.resolve(viewOf("default", "project:beta"));
		await second;
		older.resolve(viewOf("default", "project:alpha"));
		await first;
		expect(h.state().scope).toBe("project:beta");
		expect(h.state().model?.scope).toBe("project:beta");
	});

	it("drops an open answer of an older generation", async () => {
		const gate = deferred<OpenedTarget>();
		const h = harness({ open: () => gate.promise });
		const open = h.call.openTarget("project:alpha#1");
		await h.call.reload();
		gate.resolve(entryOf("project:alpha", 1));
		await open;
		expect(h.state().selection).toBeUndefined();
	});

	it("reports the error of a failed action and stays ready", async () => {
		const h = harness({
			action: async () => {
				throw new Error("The note does not exist.");
			},
		});
		await h.call.action("review", { target: "project:alpha#9" });
		expect(h.state().status).toEqual({
			text: "The note does not exist.",
			error: true,
		});
		expect(h.state().busy).toBe(false);
	});
});

describe("console controller status", () => {
	it("clears a success message after 2.5 seconds", async () => {
		const h = harness();
		await h.call.action("review", { target: "project:alpha#1" });
		expect(h.state().status).toEqual({ text: "saved", error: false });
		vi.advanceTimersByTime(2499);
		expect(h.state().status.text).toBe("saved");
		vi.advanceTimersByTime(1);
		expect(h.state().status).toEqual({ text: "", error: false });
	});

	it("keeps an error message for 8 seconds", async () => {
		const h = harness({
			action: async () => {
				throw new Error("broken");
			},
		});
		await h.call.action("review", { target: "project:alpha#1" });
		expect(h.state().status).toEqual({ text: "broken", error: true });
		vi.advanceTimersByTime(7999);
		expect(h.state().status.text).toBe("broken");
		vi.advanceTimersByTime(1);
		expect(h.state().status).toEqual({ text: "", error: false });
	});

	it("cancels the timer of an older message", async () => {
		const h = harness();
		await h.call.action("review", { target: "project:alpha#1" });
		vi.advanceTimersByTime(1000);
		h.call.clearStatus();
		expect(h.state().status).toEqual({ text: "", error: false });
		vi.advanceTimersByTime(5000);
		expect(h.state().status).toEqual({ text: "", error: false });
	});

	it("shows the loading message until the view answers", async () => {
		const gate = deferred<View>();
		const h = harness({ view: () => gate.promise });
		const reload = h.call.reload();
		expect(h.state().status.text).toBe("loading");
		gate.resolve(viewOf());
		await reload;
		expect(h.state().status).toEqual({ text: "", error: false });
	});
});

describe("console controller choices", () => {
	it("keeps the language and gives English to an unknown code", () => {
		const h = harness();
		h.call.setLanguage("ru");
		expect(h.state().lang).toBe("ru");
		expect(h.storage.data["memlens.lang"]).toBe("ru");
		h.call.setLanguage("xx");
		expect(h.state().lang).toBe("en");
		expect(h.storage.data["memlens.lang"]).toBe("en");
	});

	it("keeps the theme and gives the system setting to an unknown code", () => {
		const h = harness();
		h.call.setTheme("dark");
		expect(h.state().theme).toBe("dark");
		expect(h.storage.data["memlens.theme"]).toBe("dark");
		h.call.setTheme("purple");
		expect(h.state().theme).toBe("system");
		expect(h.storage.data["memlens.theme"]).toBe("system");
	});
});

describe("console controller dialog", () => {
	it("opens the create form on the current scope and closes it", () => {
		const h = harness();
		h.call.newNote();
		expect(h.state().dialog).toEqual({
			mode: "create",
			target: "",
			body: "",
			longform: "",
			scope: "project:alpha",
			kind: "note",
			supersedes: "",
		});
		h.call.closeDialog();
		expect(h.state().dialog).toBeNull();
	});

	it("sends a new note with the scope of the form", async () => {
		const h = harness();
		h.call.newNote();
		await h.call.saveDialog({
			body: "one line",
			longform: "document",
			scope: "team:beta",
			kind: "task",
			supersedes: "",
		});
		expect(callsOf(h, "action")[0]?.name).toBe("note");
		expect(callsOf(h, "action")[0]?.fields).toEqual({
			profile: "default",
			scope: "team:beta",
			body: "one line",
			longform: "document",
			kind: "task",
			supersedes: "",
		});
		expect(h.state().dialog).toBeNull();
	});

	it("opens the amend form from the view and sends the target", async () => {
		const record = recordOf("project:alpha", 3);
		const h = harness(
			{},
			{ model: viewOf("default", "project:alpha", [record]) },
		);
		await h.call.editNote("project:alpha#3", false);
		expect(h.state().dialog).toEqual({
			mode: "amend",
			target: "project:alpha#3",
			body: "body",
			longform: "",
			scope: "project:alpha",
			kind: "fact",
			supersedes: "",
		});
		await h.call.saveDialog({
			body: "new body",
			longform: "doc",
			scope: "team:beta",
			kind: "fact",
			supersedes: "",
		});
		expect(callsOf(h, "action")[0]?.name).toBe("amend");
		expect(callsOf(h, "action")[0]?.fields).toEqual({
			profile: "default",
			scope: "project:alpha",
			body: "new body",
			longform: "doc",
			kind: "fact",
			supersedes: "",
			target: "project:alpha#3",
			dest: "team:beta",
		});
	});

	it("opens the supersede form with the record address", async () => {
		const record = recordOf("project:alpha", 3);
		const h = harness(
			{},
			{ model: viewOf("default", "project:alpha", [record]) },
		);
		await h.call.editNote("project:alpha#3", true);
		expect(h.state().dialog).toMatchObject({
			mode: "supersede",
			target: "project:alpha#3",
			supersedes: "project:alpha#3",
		});
		await h.call.saveDialog({
			body: "next",
			longform: "",
			scope: "project:alpha",
			kind: "fact",
			supersedes: "project:alpha#3",
		});
		expect(callsOf(h, "action")[0]?.name).toBe("note");
		expect(callsOf(h, "action")[0]?.fields).toMatchObject({
			scope: "project:alpha",
			supersedes: "project:alpha#3",
		});
	});

	it("reads a record outside the view and starts with no kind", async () => {
		const h = harness({ open: async () => entryOf("team:beta", 1) });
		await h.call.editNote("team:beta#1", false);
		expect(h.state().dialog?.kind).toBe("");
		expect(h.state().dialog?.scope).toBe("team:beta");
	});
});

describe("console controller reset", () => {
	it("clears the selection, the hits, the job, and the search scope", async () => {
		const h = harness();
		h.store.set({
			selection: { target: "x", result: { kind: "children", children: [] } },
			hits: [],
			searchScope: "team:beta",
			job: { inputs: [], job: "task", profile: "default", scope: "x" },
			jobError: "failed",
		});
		await h.call.reset("project:beta");
		const state = h.state();
		expect(state.scope).toBe("project:beta");
		expect(state.selection).toBeUndefined();
		expect(state.hits).toEqual([]);
		expect(state.searchScope).toBeNull();
		expect(state.job).toBeUndefined();
		expect(state.jobError).toBe("");
		expect(callsOf(h, "view")[0]?.fields).toMatchObject({
			scope: "project:beta",
		});
	});

	it("loads the view before the search of a place", async () => {
		const h = harness();
		await h.call.restore({
			...DEFAULT_ROUTE,
			screen: "search",
			profile: "default",
			scope: "project:alpha",
			query: "words",
		});
		expect(h.calls.map((call) => call.method)).toEqual(["view", "search"]);
		expect(h.state().query).toBe("words");
		expect(h.writes.at(-1)?.step).toBe("replace");
	});

	it("falls back to the first place when the host rejects the place", async () => {
		const h = harness({
			view: async (fields) => {
				if (fields.profile === "gone") throw new Error("The scope is absent.");
				return viewOf(fields.profile || "default", fields.scope || "");
			},
		});
		await h.call.restore({ ...DEFAULT_ROUTE, profile: "gone" });
		const views = callsOf(h, "view");
		expect(views).toHaveLength(2);
		expect(views[0]?.fields).toMatchObject({ profile: "gone" });
		expect(views[1]?.fields).toMatchObject({ profile: "" });
		expect(h.state().profile).toBe("default");
	});
});

describe("console controller open", () => {
	it("opens a target and keeps the selection", async () => {
		const entry = entryOf("project:alpha", 2);
		const h = harness({ open: async () => entry });
		await h.call.openTarget("project:alpha#2");
		expect(h.state().selection).toEqual({
			target: "project:alpha#2",
			result: entry,
		});
		expect(h.writes.at(-1)?.route.target).toBe("project:alpha#2");
	});

	it("opens a catalog range with its range id", async () => {
		const h = harness({ catalog: async () => [] });
		await h.call.openCatalog({ start: 0, level: 1 });
		expect(h.state().selection).toEqual({
			target: "#0-1",
			result: { kind: "catalog", children: [] },
		});
		expect(callsOf(h, "catalog")[0]?.fields).toMatchObject({
			start: 0,
			level: 1,
		});
	});

	it("opens a target in the tree screen", async () => {
		const h = harness({
			open: async () => ({ kind: "children", children: [] }),
		});
		await h.call.openInTree("project:alpha#1");
		expect(h.state().screen).toBe("tree");
		expect(h.state().selection?.target).toBe("project:alpha#1");
	});

	it("opens the tree of one scope with no selection", async () => {
		const h = harness();
		h.store.set({
			selection: { target: "x", result: { kind: "children", children: [] } },
		});
		await h.call.openScopeTree("team:beta");
		expect(h.state().screen).toBe("tree");
		expect(h.state().scope).toBe("team:beta");
		expect(h.state().selection).toBeUndefined();
	});
});

describe("console controller search", () => {
	it("keeps the filters of the search and the hits", async () => {
		const h = harness({
			search: async () => [
				{
					addr: "project:alpha#1",
					scope: "project:alpha",
					pos: 1,
					id: "id",
					ts: "2026-11-14T10:00:00.000Z",
					kind: "fact",
					body: "words",
					longformChars: 0,
					review_at: null,
				},
			],
		});
		await h.call.search({
			query: "  words  ",
			kind: "task",
			since: "2026-11-01",
			limit: "5",
			searchScope: "",
		});
		expect(h.state().query).toBe("words");
		expect(h.state().hits).toHaveLength(1);
		expect(callsOf(h, "search")[0]?.fields).toEqual({
			profile: "default",
			scope: "",
			query: "words",
			kind: "task",
			since: "2026-11-01",
			limit: "5",
		});
	});

	it("asks for words when the query is empty", async () => {
		const h = harness();
		await h.call.search({
			query: "   ",
			kind: "",
			since: "",
			limit: "10",
			searchScope: null,
		});
		expect(h.state().status).toEqual({ text: "searchHint", error: false });
		expect(callsOf(h, "search")).toHaveLength(0);
	});
});

describe("console controller address", () => {
	it("writes the route after a screen change and skips a repeated route", () => {
		const h = harness();
		h.call.navigate("tree");
		expect(h.writes).toHaveLength(1);
		expect(h.writes[0]?.step).toBe("push");
		expect(h.writes[0]?.route).toEqual({
			...DEFAULT_ROUTE,
			screen: "tree",
			profile: "default",
			scope: "project:alpha",
		});
		h.call.navigate("tree");
		expect(h.writes).toHaveLength(1);
	});
});

describe("console controller compaction", () => {
	it("keeps the job of the prepared scope", async () => {
		const h = harness({ action: async () => ({ inputs: [], job: "task-1" }) });
		await h.call.prepareCompaction();
		expect(h.state().job).toEqual({
			inputs: [],
			job: "task-1",
			profile: "default",
			scope: "project:alpha",
		});
		expect(h.state().jobError).toBe("");
	});

	it("rejects an answer outside the job before the host call", async () => {
		const input: BuildInput = {
			range: { start: 0, level: 1 },
			children: [null, null],
		};
		const h = harness({
			action: async () => ({ inputs: [input], job: "task-1" }),
		});
		await h.call.prepareCompaction();
		const actionCalls = callsOf(h, "action").length;
		await h.call.applyCompaction("#4-5: a line");
		expect(h.state().jobError).toBe("unknownInput");
		expect(callsOf(h, "action")).toHaveLength(actionCalls);
	});

	it("clears the job after the host builds the range", async () => {
		const input: BuildInput = {
			range: { start: 0, level: 1 },
			children: [null, null],
		};
		const h = harness({
			action: async (name) =>
				name === "compact"
					? { inputs: [input], job: "task-1" }
					: { built: 1, rejected: 0, rejectedRanges: [] },
		});
		await h.call.prepareCompaction();
		await h.call.applyCompaction("#0-1: a line");
		expect(h.state().job).toBeUndefined();
		expect(h.state().status).toEqual({ text: "built", error: false });
	});
});

describe("console controller clipboard", () => {
	it("puts one text into the clipboard and states the result", async () => {
		const h = harness();
		h.call.copy("project:alpha#3");
		await vi.advanceTimersByTimeAsync(0);
		expect(h.clipboard).toEqual(["project:alpha#3"]);
		expect(h.state().status).toEqual({ text: "copied", error: false });
		vi.advanceTimersByTime(2500);
		expect(h.state().status).toEqual({ text: "", error: false });
	});

	it("states a refused clipboard in the status line", async () => {
		const h = harness({}, {}, true);
		h.call.copy("project:alpha#3");
		await vi.advanceTimersByTimeAsync(0);
		expect(h.clipboard).toEqual([]);
		expect(h.state().status).toEqual({ text: "denied", error: true });
	});
});
