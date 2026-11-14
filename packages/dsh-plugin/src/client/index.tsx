/**
 * #region moduleContract
 * @purpose Give the harness Web page the memory tab, so a human reads and changes the memory of the
 *   current session without a second window.
 * @scope The client plugin entry, its required services, the locale dictionaries, and the tab
 *   registration. NOT: the host route, the store, the console model, and the tab body.
 * @invariants The tab is one entry of the slot `conversation.view`, and its id is `memlens`.
 * @invariants The client imports no harness client package at run time.
 * @invariants The tab label reads the active language at call time, so a language change needs no
 *   second registration.
 * @dependencies USES API: the slot service and the locale service of the harness Web page.
 * @keywords client, plugin, tab, view, slot, memory, locale
 * #endregion moduleContract
 */

import type { Translate } from "../../../ui/src/model/console.js";
import type { ClientContext } from "./context.js";
import { consoleMessage, NS, TAB_KEY } from "./locales.js";
import { MemoryView } from "./view.js";

/** The slot that holds the conversation view tabs. */
const VIEW_SLOT = "conversation.view";

/** The entry id of the tab. */
const TAB_ID = "memlens";

/** The client plugin needs the slot service and the locale service. */
export const inject = ["slots", "locale"];

// #region FUNC_apply
/**
 * @purpose Register the memory tab for each mounted conversation view slot.
 * @invariants The registration carries the session id and the translate function to the tab.
 * @param ctx - The client plugin context.
 */
export function apply(ctx: ClientContext): void {
	console.debug("Register the memory tab", { event: "apply", slot: VIEW_SLOT });
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
