/**
 * Console scope rules.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Resolve the scope of one console request, so each handler works on one listed scope.
 * @scope
 *  - The requested scope, the newest scope, and the active scope of the directory.
 *  - NOT: the HTTP transport, the action semantics, and the listed scope check.
 * @invariants A scope outside the profile gives NotAllowed.
 * @usecases
 *  - View: client => gives no scope => gets the active scope or the first listed scope
 * @dependencies USES API: @memlens/core
 * @keywords ui, scope, resolve, active
 * #endregion moduleContract
 */

import {
	allowedScope,
	concreteScopeKey,
	type Fields,
	newestScope,
	type ScopeKey,
	text,
} from "@memlens/core";
import { cliActiveScope, profileLists, type Runtime } from "../runtime.js";
import { type HostOptions, hostOf } from "./http.js";

// #region FUNC_resolveScope
/**
 * Resolve the scope of one request.
 *
 * @purpose Give each request one listed scope, so the handlers share the default rule.
 * @invariants A requested scope wins. With no request, the scope of the newest live note applies,
 *   else the active scope of the directory applies when the profile lists it, and the first visible
 *   scope applies otherwise. The config fallback takes no scope pattern, so the answer names one
 *   concrete scope.
 */
export function resolveScope(
	runtime: Runtime,
	fields: Fields,
	options: HostOptions,
): ScopeKey {
	const requested = text(fields, "scope");
	const visible = runtime.scopes;
	const fresh = requested ? null : newestScope(runtime.store, visible);
	const fallback = cliActiveScope(runtime.base, options.cwd ?? process.cwd());
	const first =
		visible[0] ??
		runtime.config.profile.scopes.find(concreteScopeKey) ??
		fallback;
	return allowedScope(
		hostOf(runtime),
		requested || fresh || (profileLists(runtime, fallback) ? fallback : first),
	);
}
// #endregion FUNC_resolveScope
