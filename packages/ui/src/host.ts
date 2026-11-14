/**
 * #region moduleContract
 * @purpose Talk to the local console host and keep each answer in the page address. A reload
 * and the browser buttons return to the same place.
 * @scope The view, the search, the open calls, the action call, the route text, and the history
 * write. NOT: the screens and the store rules.
 * @invariants A read writes the address only after the host answers.
 * @invariants A navigation adds one history entry after its view loads, and a write replaces the
 * current entry.
 * @invariants Keep the view of one generation, so a slow answer cannot overwrite a newer place.
 * @dependencies GET view, search, open and POST action from the CLI host.
 * @keywords host, view, search, open, action, address, history
 * #endregion moduleContract
 */

import type { IndexHit } from "../../core/src/store/types.js";
import { message } from "./controls.js";
import { repaint } from "./repaint.js";
import type { Route } from "./route.js";
import { routeOf } from "./route.js";
import { state, tr } from "./state.js";
import type { Step, View } from "./types.js";

// #region FUNC_current
/**
 * @purpose Read the state of the console as one address.
 */
export function current(): Route {
	return {
		screen: state.screen,
		profile: state.profile,
		scope: state.scope,
		target: state.selection?.target ?? "",
		query: state.query,
		searchScope: state.searchScope,
		kind: state.kind,
		since: state.since,
		limit: state.limit,
		reviewKind: state.reviewKind,
	};
}
// #endregion FUNC_current

// #region FUNC_enter
/**
 * @purpose Put the state of the console into the page address at the chosen history step.
 * @invariants The address keeps its path, so the host serves the same page for each place. A
 * repeated address writes nothing, so a second click on the live scope adds no entry.
 */
export function enter(step: Step): void {
	if (step === "none") return;
	const here = `${location.pathname}${location.search}`;
	const url = `${location.pathname}?${routeOf(current())}`;
	if (url === here) return;
	history[step === "push" ? "pushState" : "replaceState"](null, "", url);
	console.debug("Console address", { event: "address", step, url });
}
// #endregion FUNC_enter

// #region FUNC_request
/**
 * @purpose Surface API errors and return successful JSON results.
 */
export async function request<T>(path: string, body?: unknown): Promise<T> {
	const response = await fetch(
		path,
		body === undefined
			? { cache: "no-store" }
			: {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				},
	);
	const text = await response.text();
	let value: unknown;
	try {
		value = text ? JSON.parse(text) : null;
	} catch {
		throw new Error(tr("badJson", { status: response.status }));
	}
	if (!response.ok)
		throw new Error(
			value && typeof value === "object" && "error" in value
				? String(value.error)
				: `HTTP ${response.status}`,
		);
	return value as T;
}
// #endregion FUNC_request

// #region FUNC_action
/**
 * @purpose Apply one user action once and refresh its visible result.
 * @invariants A second action waits until the first one finishes.
 */
export async function action(
	name: string,
	extra: Record<string, unknown> = {},
): Promise<unknown> {
	if (state.busy) throw new Error(tr("busyAction"));
	state.busy = true;
	message(tr("saving"));
	try {
		console.debug("Console action", {
			event: "action",
			action: name,
			profile: state.profile,
			scope: state.scope,
		});
		const result = await request<unknown>("/api/action", {
			profile: state.profile,
			scope: state.scope,
			action: name,
			...extra,
		});
		for (const dialog of document.querySelectorAll("dialog[open]"))
			(dialog as HTMLDialogElement).close();
		state.selection = undefined;
		await reload();
		message(tr("saved"));
		return result;
	} finally {
		state.busy = false;
	}
}
// #endregion FUNC_action

// #region FUNC_reload
/**
 * @purpose Refresh the console after a profile, scope, or store change.
 * @invariants The host resolves the profile and the scope, so the address takes the resolved
 * values.
 */
export async function reload(step: Step = "replace"): Promise<void> {
	const token = ++state.generation;
	message(tr("loading"));
	const params = new URLSearchParams({
		profile: state.profile,
		scope: state.scope,
		kind: state.reviewKind,
	});
	const view = await request<View>(`/api/view?${params.toString()}`);
	if (token !== state.generation) return;
	if (!view || !Array.isArray(view.scopes) || !Array.isArray(view.records))
		throw new Error(tr("badView"));
	state.model = view;
	state.profile = view.profile;
	state.scope = view.scope;
	console.debug("Console loaded", {
		event: "view",
		profile: state.profile,
		scope: state.scope,
		records: view.records.length,
		frontier: view.frontier.length,
		revision: view.revision,
	});
	enter(step);
	message("");
	repaint();
}
// #endregion FUNC_reload

// #region FUNC_find
/**
 * @purpose Run the current search filters and keep the hits.
 */
export async function find(step: Step): Promise<void> {
	const token = state.generation;
	const params = new URLSearchParams({
		profile: state.profile,
		scope: state.searchScope ?? "",
		query: state.query,
		kind: state.kind,
		since: state.since,
		limit: state.limit,
	});
	const found = await request<IndexHit[]>(`/api/search?${params.toString()}`);
	if (token !== state.generation) return;
	state.hits = found;
	console.debug("Console search", {
		event: "search",
		hits: found.length,
		scope: state.searchScope ?? "",
		query: state.query,
	});
	enter(step);
	repaint();
}
// #endregion FUNC_find
