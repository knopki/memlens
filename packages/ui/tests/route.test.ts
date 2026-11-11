/**
 * #region moduleContract
 * @purpose Hold the address of the console to its closed sets, so a hand-edited address cannot
 * break a screen.
 * @scope The read and the write of the ten address fields of the route module.
 * #endregion moduleContract
 */

import { describe, expect, it } from "vitest";
import { DEFAULT_ROUTE, type Route, readRoute, routeOf } from "../src/route.js";

const full: Route = {
	screen: "review",
	profile: "work",
	scope: "project:alpha",
	target: "project:alpha#12",
	query: "deploy words",
	searchScope: "team:beta",
	kind: "task",
	since: "2026-11-01",
	limit: "25",
	reviewKind: "decision",
};

describe("console address", () => {
	it("writes no field of the default place", () => {
		expect(routeOf(DEFAULT_ROUTE)).toBe("");
	});

	it("keeps a place through the write and the read", () => {
		expect(readRoute(routeOf(full))).toEqual(full);
	});

	it("keeps the selected scope out of the search field", () => {
		const base = { ...DEFAULT_ROUTE, query: "words" };
		expect(readRoute(routeOf(base)).searchScope).toBeNull();
		expect(routeOf({ ...base, searchScope: "" })).toContain("s=*");
		expect(readRoute("s=*").searchScope).toBe("");
		expect(readRoute("s=team:beta").searchScope).toBe("team:beta");
	});

	it("gives the default of a field with a value outside its set", () => {
		const route = readRoute(
			"screen=nope&kind=bogus&rkind=bogus&since=11.11.2026&limit=999",
		);
		expect(route.screen).toBe("overview");
		expect(route.kind).toBe("");
		expect(route.reviewKind).toBe("");
		expect(route.since).toBe("");
		expect(route.limit).toBe("10");
	});

	it("gives the default of each field on an empty address", () => {
		expect(readRoute("")).toEqual(DEFAULT_ROUTE);
		expect(readRoute("?limit=0&since=")).toEqual(DEFAULT_ROUTE);
	});
});
