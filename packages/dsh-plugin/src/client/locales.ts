/**
 * #region moduleContract
 * @purpose Give the tab its texts in one locale namespace, so its label and its screens follow the
 *   language of the harness page.
 * @scope The namespace, the eight dictionaries, the tab name, and the translate function with the
 * English fallback. NOT: the slot registration, the tab body, and the host route.
 * @invariants The namespace holds the eight message tables of the console, one panel name, and one
 *   tab name.
 * @invariants A refused registration gives the English table, so the tab still draws its text.
 * @invariants The translate function reads the active language at call time.
 * @dependencies USES API: @memlens/ui
 * @keywords client, locale, namespace, dictionary, tab, fallback, text
 * #endregion moduleContract
 */

import {
	fill,
	LANGS,
	type Lang,
	MESSAGES,
	messages,
	type Table,
} from "@memlens/ui";
import type { ClientContext, Message } from "./context.js";

/** The locale namespace of the tab. */
export const NS = "memlens";

/** The message key of the tab name. The console tables hold no tab name, so the client adds one. */
export const TAB_KEY = "tab";

/** The message key of the panel name. The console tables hold no panel name, so the client adds
 * one. */
export const PANEL_KEY = "panel";

// #region CONST_TAB_NAMES
/**
 * @purpose Name the tab in each language of the console, so the tab row shows a short name.
 * @invariants Each name follows the word of the console title of the same language.
 */
export const TAB_NAMES: Readonly<Record<Lang, string>> = {
	de: "Gedächtnis",
	en: "Memory",
	es: "Memoria",
	fr: "Mémoire",
	ja: "記憶",
	pt: "Memória",
	ru: "Память",
	zh: "记忆",
};
// #endregion CONST_TAB_NAMES

// #region CONST_PANEL_NAMES
/**
 * @purpose Name the panel in each language of the console, so the sidebar row and the page head
 * show a short name.
 * @invariants Each name follows the word of the console title of the same language.
 */
export const PANEL_NAMES: Readonly<Record<Lang, string>> = TAB_NAMES;
// #endregion CONST_PANEL_NAMES

// #region FUNC_dictionaries
/**
 * @purpose Build the dictionary of each language for one register call.
 * @invariants Each dictionary holds every key of its message table, the panel name, and the tab
 *   name.
 */
export function dictionaries(): Record<string, Record<string, string>> {
	const all: Record<string, Record<string, string>> = {};
	for (const code of LANGS)
		all[code] = {
			...MESSAGES[code],
			[PANEL_KEY]: PANEL_NAMES[code],
			[TAB_KEY]: TAB_NAMES[code],
		};
	return all;
}
// #endregion FUNC_dictionaries

// #region FUNC_english
/**
 * @purpose Give the English text of one key, for a page whose locale service refuses the
 *   registration.
 * @invariants An unknown key gives the key text, as the locale service does.
 */
function english(
	key: string,
	values: Record<string, string | number> = {},
): string {
	if (key === TAB_KEY) return fill(TAB_NAMES.en, values);
	if (key === PANEL_KEY) return fill(PANEL_NAMES.en, values);
	return fill(messages("en")[key as keyof Table] ?? key, values);
}
// #endregion FUNC_english

// #region FUNC_consoleMessage
/**
 * @purpose Register the dictionaries and give the translate function of the tab.
 * @invariants The effect owns the registration, so the plugin disposal removes the dictionaries.
 * @invariants A refused registration gives the English table, and the tab still draws its text.
 * @param ctx - The client plugin context that holds the locale service.
 */
export function consoleMessage(ctx: ClientContext): Message {
	let message: Message = english;
	ctx.effect(() => {
		try {
			const dispose = ctx.locale.register(NS, dictionaries());
			message = ctx.locale.bind(NS);
			console.debug("Locale registered", { event: "locale", namespace: NS });
			return dispose;
		} catch (error) {
			console.debug("Locale registration refused", {
				event: "locale-fallback",
				namespace: NS,
				error: String(error),
			});
			return undefined;
		}
	}, "memlens: locale dictionaries");
	return (key, values) => message(key, values);
}
// #endregion FUNC_consoleMessage
