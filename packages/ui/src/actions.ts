/**
 * #region moduleContract
 * @purpose Move the console to a place and open its target. A click, a reload, and a browser
 * button reach the same state.
 * @scope The screen step, the restore of an address, the profile and scope reset, and the four open
 * calls. NOT: the host calls and the markup.
 * @dependencies USES: the host calls, the address module, and the range format.
 * @keywords screen, restore, reset, open, target, fallback
 * #endregion moduleContract
 */

import type { OpenChildren, OpenEntry } from "../../core/src/domain/reads.js";
import type { Range, SliceLine } from "../../core/src/types/tree.js";
import { rangeId, rangeOf } from "./format.js";
import { enter, find, reload, request } from "./host.js";
import { repaint } from "./repaint.js";
import { DEFAULT_ROUTE, type Route, type Screen } from "./route.js";
import { state } from "./state.js";
import type { Step } from "./types.js";

// #region FUNC_go
/**
 * @purpose Show one screen and keep its place in the address.
 */
export function go(screen: Screen, step: Step = "push"): void {
	state.screen = screen;
	enter(step);
	repaint();
}
// #endregion FUNC_go

// #region FUNC_restore
/**
 * @purpose Move the console to the place of one address.
 * @invariants Load the view first. Then write the resolved place as one replacement, so the address
 *   never loses the target. A place that the host rejects falls back to the first place once, so a
 *   removed profile cannot leave a blank page.
 */
export async function restore(route: Route, retry = true): Promise<void> {
	const { target, ...fields } = route;
	Object.assign(state, fields);
	state.selection = undefined;
	state.hits = [];
	state.job = undefined;
	state.jobError = "";
	console.debug("Console restore", {
		event: "restore",
		screen: route.screen,
		profile: route.profile,
		scope: route.scope,
		target,
		query: route.query,
	});
	try {
		await reload("none");
	} catch (error) {
		if (!retry) throw error;
		console.debug("Console place rejected", {
			event: "fallback",
			error: String(error),
		});
		await restore(DEFAULT_ROUTE, false);
		return;
	}
	if (state.query) await find("none");
	if (target)
		await (route.screen === "catalog"
			? openCatalog(rangeOf(target), "none")
			: openTarget(target, "none"));
	enter("replace");
}
// #endregion FUNC_restore

// #region FUNC_reset
/**
 * @purpose Move the console to one scope with no selection and no job.
 */
export async function reset(
	nextScope: string,
	step: Step = "push",
): Promise<void> {
	state.scope = nextScope;
	state.selection = undefined;
	state.hits = [];
	state.searchScope = null;
	state.job = undefined;
	state.jobError = "";
	await reload(step);
}
// #endregion FUNC_reset

// #region FUNC_openTarget
/**
 * @purpose Expand a range or inspect a note, and keep the selection for the inspector.
 * @invariants Write the address only after the host answers.
 */
export async function openTarget(
	target: string,
	step: Step = "push",
): Promise<void> {
	const token = state.generation;
	const result = await request<OpenEntry | OpenChildren>(
		`/api/open?${new URLSearchParams({ profile: state.profile, scope: state.scope, target })}`,
	);
	if (token !== state.generation) return;
	console.debug("Console target opened", {
		event: "open",
		target,
		kind: result.kind,
		step,
	});
	state.selection = { target, result };
	enter(step);
	repaint();
}
// #endregion FUNC_openTarget

// #region FUNC_openInTree
/**
 * @purpose Select the tree screen and open one record in its inspector as one place.
 */
export async function openInTree(target: string): Promise<void> {
	await openTarget(target, "none");
	go("tree");
}
// #endregion FUNC_openInTree

// #region FUNC_openCatalog
/**
 * @purpose Expand one catalog range into the two lines below it, and keep the selection.
 * @invariants Write the address only after the host answers.
 */
export async function openCatalog(
	range: Range,
	step: Step = "push",
): Promise<void> {
	const token = state.generation;
	const params = new URLSearchParams({
		profile: state.profile,
		scope: state.scope,
		start: String(range.start),
		level: String(range.level),
	});
	const children = await request<SliceLine[]>(
		`/api/catalog?${params.toString()}`,
	);
	if (token !== state.generation) return;
	console.debug("Console catalog opened", {
		event: "catalog",
		start: range.start,
		level: range.level,
		lines: children.length,
	});
	state.selection = {
		target: rangeId(range),
		result: { kind: "catalog", children },
	};
	enter(step);
	repaint();
}
// #endregion FUNC_openCatalog

// #region FUNC_openScopeTree
/**
 * @purpose Open the tree screen of one scope as one place.
 */
export async function openScopeTree(key: string): Promise<void> {
	state.screen = "tree";
	await reset(key);
}
// #endregion FUNC_openScopeTree
