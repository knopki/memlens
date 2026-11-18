/**
 * #region moduleContract
 * @purpose Hold the address adapter to one route round trip and to the two history steps, so a
 * reload and a browser button return to the same console place.
 * @scope The read of a query text, the write to the browser history, and the empty address.
 * @invariants Each test gives one fixed route and one fixed address.
 * @keywords test, address, route, history, round trip
 * #endregion moduleContract
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ROUTE, type Route, routeOf } from "../../src/route.js";
import { readAddress, writeAddress } from "../../src/standalone/address.js";

/** One place with every field away from its default. */
const ROUTE: Route = {
	screen: "search",
	profile: "default",
	scope: "project:alpha",
	target: "project:alpha#1",
	query: "budget",
	searchScope: "",
	kind: "fact",
	since: "2026-11-01",
	limit: "20",
	reviewKind: "task",
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("address adapter", () => {
	it("reads the route that it wrote", () => {
		const written = `?${routeOf(ROUTE)}`;
		expect(readAddress(written)).toEqual(ROUTE);
	});

	it("gives the first place of an empty address", () => {
		expect(readAddress("")).toEqual(DEFAULT_ROUTE);
	});

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
