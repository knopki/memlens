/**
 * DeepSeek Harness plugin of memlens.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Let the harness start the library function and show it to the agent.
 * @scope
 *  - The plugin contract: the name and the registration of contributions.
 *  - NOT: the library logic and the CLI.
 * @invariants Each registration is an effect of the plugin context.
 * @dependencies USES API: @deepseek-ai/cordis
 * @keywords dsh, plugin, harness, memlens
 * #endregion moduleContract
 */
import { debuglog } from "node:util";
import type { Context } from "@deepseek-ai/cordis";

const debug = debuglog("memlens:plugin");

/** The plugin identifier. The bundle row in cordis.patch.yml uses this name. */
export const name = "dsh-memlens";

// #region FUNC_apply
/**
 * Register the contributions of the plugin.
 *
 * @purpose Give the harness one entry that adds and removes the plugin contributions.
 * @param _ctx - The plugin context. A registration uses it as an effect.
 */
export function apply(_ctx: Context): void {
	// No contribution yet. The first registration comes with an accepted requirement.
	debug("Plugin loaded", { event: "start", name });
}
// #endregion FUNC_apply
