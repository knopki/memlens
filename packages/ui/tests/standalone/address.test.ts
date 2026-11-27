/**
 * #region moduleContract
 * @purpose Hold the write of the address adapter to the chosen history step, so a click puts one
 * console place into the page address.
 * @scope The write to the browser history, and the step that writes nothing.
 * @invariants Each test gives one fixed route and one fixed address.
 * @keywords test, address, history, pushstate, replacestate
 * #endregion moduleContract
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { type Route, routeOf } from "../../src/route.js";
import { writeAddress } from "../../src/standalone/address.js";

/** One place with every field away from its default. */
const ROUTE: Route = {
	screen: "search",
	profile: "default",
	scope: "project:alpha",
	target: "project:alpha#1",
	query: "budget",
	searchScope: "",
	kinds: ["fact"],
	since: "2026-11-01",
	until: "2026-11-30",
	due: true,
	limit: "20",
	reviewKind: "task",
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("address adapter", () => {
	it("keeps the path of the page and the chosen history step", () => {
		const pushState = vi.fn();
		const replaceState = vi.fn();
		vi.stubGlobal("location", { pathname: "/", search: "" });
		vi.stubGlobal("history", { pushState, replaceState });
		const url = `/?${routeOf(ROUTE)}`;

		writeAddress(ROUTE, "push");
		expect(pushState).toHaveBeenCalledWith(null, "", url);

		writeAddress(ROUTE, "replace");
		expect(replaceState).toHaveBeenCalledWith(null, "", url);
	});

	it("writes no history entry at the step none", () => {
		const pushState = vi.fn();
		const replaceState = vi.fn();
		vi.stubGlobal("location", { pathname: "/", search: "" });
		vi.stubGlobal("history", { pushState, replaceState });

		writeAddress(ROUTE, "none");
		expect(pushState).not.toHaveBeenCalled();
		expect(replaceState).not.toHaveBeenCalled();
	});
});
