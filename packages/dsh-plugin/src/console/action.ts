/**
 * #region moduleContract
 * @purpose Route one console action of the tab to the shared backend, so a user curates the store
 *   from the harness GUI.
 * @scope
 *  - The dispatch of the compaction action.
 *  - NOT: the edit rules, the read routes, the transport, and the compaction job code.
 * @invariants The plugin host permits a delete through the harness Remote service. A delete still
 *   needs confirmation.
 * @dependencies USES API: @memlens/core
 * @keywords console, action, route, compact
 * #endregion moduleContract
 */

import { consoleAction, text } from "@memlens/core";
import { compactAction } from "./compact.js";
import { type ConsoleRequest, hostOf } from "./scope.js";

// #region FUNC_actionRoute
/**
 * @purpose Send each action to one handler, so the route holds no edit rule.
 * @invariants A delete of one record or of one scope needs confirmation.
 */
export async function actionRoute(request: ConsoleRequest): Promise<unknown> {
	const { memory, scope, fields } = request;
	const action = text(fields, "action");
	if (action === "compact" || action === "compact-answer")
		return compactAction(request);
	return consoleAction(hostOf(memory), fields, scope);
}
// #endregion FUNC_actionRoute
