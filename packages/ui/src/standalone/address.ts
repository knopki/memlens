/**
 * #region moduleContract
 * @purpose Keep the place of a human in the page address of the standalone host, so a reload and
 * the browser buttons return to the same screen, scope, and note.
 * @scope The read of the query text, the write to the browser history, and the popstate listener.
 * NOT: the route format, the state rules, and the markup.
 * @invariants A write keeps the path of the page, so the host serves the same page for each place.
 * @invariants A repeated address writes nothing, so a second click on the live scope adds no entry.
 * @dependencies READS: the page address. WRITES: the browser history.
 * @keywords address, route, history, pushstate, replacestate, popstate
 * #endregion moduleContract
 */

import { type Route, readRoute, routeOf } from "../route.js";
import type { Step } from "../types.js";

// #region FUNC_readAddress
/**
 * @purpose Read the console place of one page query text.
 * @invariants Keep each value inside the closed set of its field, as the route module does.
 * @param search - The query text of the page address.
 */
export function readAddress(search: string): Route {
	return readRoute(search);
}
// #endregion FUNC_readAddress

// #region FUNC_writeAddress
/**
 * @purpose Put one console place into the page address at the chosen history step.
 */
export function writeAddress(route: Route, step: Step): void {
	if (step === "none") return;
	const here = `${location.pathname}${location.search}`;
	const url = `${location.pathname}?${routeOf(route)}`;
	if (url === here) return;
	history[step === "push" ? "pushState" : "replaceState"](null, "", url);
	console.debug("Console address", { event: "address", step, url });
}
// #endregion FUNC_writeAddress

// #region FUNC_watchAddress
/**
 * @purpose Call one step for each browser back or forward move.
 * @invariants The returned function removes the listener.
 */
export function watchAddress(onMove: () => void): () => void {
	window.addEventListener("popstate", onMove);
	return () => {
		window.removeEventListener("popstate", onMove);
	};
}
// #endregion FUNC_watchAddress
