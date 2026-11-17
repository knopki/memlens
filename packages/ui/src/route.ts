/**
 * #region moduleContract
 * @purpose Keep the place of a human in the address of the console page, so a reload and the
 * browser buttons return to the same screen, scope, and note.
 * @scope The seven screen names, the note kinds, and the read and write of the ten address
 * fields. NOT: the history calls, the screen controls, and the store reads.
 * @rationale
 *  - Q: Why does this module write no log message? A: The client logs the read and the write of the
 *    address. A pure mapping holds no event of its own.
 * @keywords address, route, query, history, reload, screen, scope, filters
 * #endregion moduleContract
 */

import type { NoteKind } from "@memlens/core";
import { NOTE_KINDS } from "@memlens/core/view";

/** The seven screens of the console. The order matches the number keys and the rail. */
export const SCREENS = [
	"overview",
	"tree",
	"catalog",
	"search",
	"review",
	"proposals",
	"maintenance",
] as const;

/** The name of one console screen. */
export type Screen = (typeof SCREENS)[number];

/** The note kinds of the console, in the order of the configuration. */
export const KINDS = NOTE_KINDS;

// #region TYPE_route
/**
 * @purpose Hold one place of the console as plain text, so the address and the screen state share
 * one shape.
 * @invariants `searchScope` is null when the search follows the selected scope, and empty when it
 * reads every visible scope. An empty text means that the field holds its default. The field `s`
 * holds `*` for every visible scope, a scope key for one scope, and no field for the selected
 * scope.
 */
export type Route = {
	screen: Screen;
	profile: string;
	scope: string;
	target: string;
	query: string;
	searchScope: string | null;
	kind: NoteKind | "";
	since: string;
	limit: string;
	reviewKind: NoteKind | "";
};
// #endregion TYPE_route

/** The place of a first visit: the overview of the default profile with no filter. */
export const DEFAULT_ROUTE: Route = {
	screen: "overview",
	profile: "",
	scope: "",
	target: "",
	query: "",
	searchScope: null,
	kind: "",
	since: "",
	limit: "10",
	reviewKind: "",
};

// #region FUNC_routeOf
/**
 * @purpose Turn a place of the console into the query text of the page address.
 * @invariants Write the keys `screen`, `profile`, `scope`, `target`, `q`, `s`, `kind`, `since`,
 * `limit`, and `rkind`. Leave out a key that holds its default value.
 */
export function routeOf(route: Route): string {
	const params = new URLSearchParams();
	const put = (key: string, value: string | null, fallback: string) => {
		if (value !== null && value !== fallback) params.set(key, value);
	};
	put("screen", route.screen, DEFAULT_ROUTE.screen);
	put("profile", route.profile, "");
	put("scope", route.scope, "");
	put("target", route.target, "");
	put("q", route.query, "");
	put("s", route.searchScope === "" ? "*" : route.searchScope, "");
	put("kind", route.kind, "");
	put("since", route.since, "");
	put("limit", route.limit, DEFAULT_ROUTE.limit);
	put("rkind", route.reviewKind, "");
	return params.toString();
}
// #endregion FUNC_routeOf

// The text of a date field, as the date control writes it.
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const kindOf = (raw: string): NoteKind | "" =>
	(KINDS as readonly string[]).includes(raw) ? (raw as NoteKind) : "";

// #region FUNC_readRoute
/**
 * @purpose Turn the query text of the page address into a place of the console.
 * @invariants Keep each value inside the closed set of its field. A missing or rejected value gives
 * the default of that field.
 */
export function readRoute(search: string): Route {
	const params = new URLSearchParams(search);
	const scope = params.get("s") ?? "";
	const since = params.get("since") ?? "";
	const limit = Number(params.get("limit") ?? "");
	return {
		screen:
			SCREENS.find((name) => name === params.get("screen")) ??
			DEFAULT_ROUTE.screen,
		profile: params.get("profile") ?? "",
		scope: params.get("scope") ?? "",
		target: params.get("target") ?? "",
		query: params.get("q") ?? "",
		searchScope: scope === "" ? null : scope === "*" ? "" : scope,
		kind: kindOf(params.get("kind") ?? ""),
		since: DATE.test(since) ? since : "",
		limit:
			Number.isInteger(limit) && limit > 0 && limit <= 50
				? String(limit)
				: DEFAULT_ROUTE.limit,
		reviewKind: kindOf(params.get("rkind") ?? ""),
	};
}
// #endregion FUNC_readRoute
