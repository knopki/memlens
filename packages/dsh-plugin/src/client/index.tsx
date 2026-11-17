/**
 * #region moduleContract
 * @purpose Give the harness Web page the memory surfaces: the page of the left side panel and the
 *   state tab of one session.
 * @scope The two slot registrations, the panel icon, the locales, and the Remote mount. NOT: the
 *   page body, the tab body, the host service, and the route.
 * @invariants The page mounts in the keyed slot `main` under the panel id, and the sidebar row of
 *   the same id opens it.
 * @invariants The tab mounts in the slot `conversation.view` with a session id and a translate
 *   function.
 * @invariants The client entry imports no harness client package. It holds its own contracts.
 * @dependencies USES API: the slot service, the locale service, and the Remote service of the
 * harness Web page.
 * @keywords client, plugin, panel, tab, sidebar, slot, memory, locale, remote
 * #endregion moduleContract
 */

import type { Translate } from "@memlens/ui";
import { mountConsole } from "./console.js";
import type { ClientContext } from "./context.js";
import { MemoryPanelIcon } from "./icon.js";
import { consoleMessage, NS, PANEL_KEY, TAB_KEY } from "./locales.js";
import { MemoryPage } from "./page.js";
import { MemoryView } from "./view.js";

/** The slot that holds the conversation view tabs. */
const VIEW_SLOT = "conversation.view";

/** The slot that holds the global panels of the centre column. */
const MAIN_SLOT = "main";

/** The slot that holds the panel rows of the left side panel. */
const PANEL_SLOT = "sidebar.panellist";

/** The panel id. The sidebar row and the page registration share it. */
const PANEL_ID = "memlens";

/** The entry id of the tab. */
const TAB_ID = "memlens";

/** The row order of the panel: after the tasks panel and before the context panel. */
const PANEL_ORDER = 15;

/** The client plugin needs the slot service, the locale service, and the Remote service. */
export const inject = ["slots", "locale", "remote"];

// #region FUNC_apply
/**
 * @purpose Mount the Remote and register the page, its sidebar row, and the session tab.
 * @invariants The page registration carries the translate function to the page.
 * @invariants The tab registration carries the session id and the translate function to the tab.
 * @param ctx - The client plugin context.
 */
export function apply(ctx: ClientContext): void {
	console.debug("Register the memory surfaces", {
		event: "apply",
		main: MAIN_SLOT,
		panel: PANEL_SLOT,
		tab: VIEW_SLOT,
	});
	mountConsole(ctx);
	const message = consoleMessage(ctx);
	const t: Translate = (key, values = {}) => message(key, values);
	ctx.slots.inject(PANEL_SLOT, () =>
		ctx.slots.register(
			{
				name: PANEL_SLOT,
				id: PANEL_ID,
				order: PANEL_ORDER,
				locale: NS,
				label: () => message(PANEL_KEY),
			},
			MemoryPanelIcon,
		),
	);
	ctx.slots.inject(MAIN_SLOT, () =>
		ctx.slots.register(
			{
				name: MAIN_SLOT,
				key: PANEL_ID,
				locale: NS,
				inject: () => ({ t, title: message(PANEL_KEY) }),
			},
			MemoryPage,
		),
	);
	ctx.slots.inject(VIEW_SLOT, () =>
		ctx.slots.register(
			{
				name: VIEW_SLOT,
				id: TAB_ID,
				order: 20,
				locale: NS,
				label: () => message(TAB_KEY),
				inject: (sessionId: string) => ({
					sessionId,
					t,
					title: message(PANEL_KEY),
				}),
			},
			MemoryView,
		),
	);
}
// #endregion FUNC_apply
