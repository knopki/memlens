/**
 * #region moduleContract
 * @purpose Give the harness Web page the memory tab, so a human reads and changes the memory of the
 *   current session without a second window.
 * @scope The client plugin entry, its required services, the locale dictionaries, the Remote mount,
 *   and the tab registration. NOT: the host service, the store, the console model, and the tab body.
 * @invariants The tab is one entry of the slot `conversation.view`, and its id is `memlens`.
 * @invariants The client imports no harness client package at run time.
 * @invariants The tab label reads the active language at call time, so a language change needs no
 *   second registration.
 * @invariants The console reaches the host over the Remote namespace `memlens` and over no HTTP
 *   route.
 * @dependencies USES API: the slot service, the locale service, and the Remote service of the
 * harness Web page.
 * @keywords client, plugin, tab, view, slot, memory, locale, remote
 * #endregion moduleContract
 */

import type { Translate } from "../../../ui/src/model/console.js";
import { mountConsole } from "./console.js";
import type { ClientContext } from "./context.js";
import { consoleMessage, NS, TAB_KEY } from "./locales.js";
import { MemoryView } from "./view.js";

/** The slot that holds the conversation view tabs. */
const VIEW_SLOT = "conversation.view";

/** The entry id of the tab. */
const TAB_ID = "memlens";

/** The client plugin needs the slot service, the locale service, and the Remote service. */
export const inject = ["slots", "locale", "remote"];

// #region FUNC_apply
/**
 * @purpose Mount the Remote and register the memory tab for each mounted conversation view slot.
 * @invariants The registration carries the session id and the translate function to the tab.
 * @param ctx - The client plugin context.
 */
export function apply(ctx: ClientContext): void {
	console.debug("Register the memory tab", { event: "apply", slot: VIEW_SLOT });
	mountConsole(ctx);
	const message = consoleMessage(ctx);
	const t: Translate = (key, values = {}) => message(key, values);
	ctx.slots.inject(VIEW_SLOT, () =>
		ctx.slots.register(
			{
				name: VIEW_SLOT,
				id: TAB_ID,
				order: 20,
				locale: NS,
				label: () => message(TAB_KEY),
				inject: (sessionId: string) => ({ sessionId, t }),
			},
			MemoryView,
		),
	);
}
// #endregion FUNC_apply
