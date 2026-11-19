/**
 * Console action route.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Route one console action over HTTP to the shared backend, so a user curates the store
 *   from the browser.
 * @scope
 *  - The dispatch of the compaction action and the delete permission of the CLI.
 *  - NOT: the edit rules, the read routes, and the compaction job code.
 * @invariants A delete of one record or of one scope needs --allow-delete and confirmation.
 * @dependencies USES API: @memlens/core
 * @keywords ui, action, route, delete, compact
 * #endregion moduleContract
 */

import {
	consoleAction,
	type Fields,
	MemlensError,
	type ScopeKey,
	text,
} from "@memlens/core";
import type { Runtime } from "../runtime.js";
import { compactAction } from "./compact.js";
import { type HostOptions, hostOf } from "./http.js";

// #region FUNC_actionRoute
/**
 * Apply one action of the console.
 *
 * @purpose Send each action to one handler, so the route holds no edit rule.
 * @invariants A delete of one record or of one scope needs --allow-delete and confirmation. An
 *   unknown action gives a Usage error.
 */
export async function actionRoute(
	runtime: Runtime,
	fields: Fields,
	scope: ScopeKey,
	options: HostOptions,
): Promise<unknown> {
	const action = text(fields, "action");
	if (action === "compact" || action === "compact-answer")
		return compactAction(runtime, scope, fields);
	if (
		(action === "delete" || action === "scope-delete") &&
		options.allowDelete !== true
	)
		throw new MemlensError(
			"NotAllowed",
			"Delete needs --allow-delete and confirmation.",
		);
	return consoleAction(hostOf(runtime), fields, scope);
}
// #endregion FUNC_actionRoute
