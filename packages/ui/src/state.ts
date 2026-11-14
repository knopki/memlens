/**
 * #region moduleContract
 * @purpose Hold the state and the message table of one console page. A language change reaches
 * every text.
 * @scope The address fields, the loaded view, the selection, the job, the search filters, the
 * language and theme choice, and the local storage keys. NOT: the markup and the host calls.
 * @invariants A page starts in English. A stored language or theme survives a reload.
 * @dependencies READS: localStorage. WRITES: localStorage.
 * @keywords console, state, language, theme, storage
 * #endregion moduleContract
 */

import type { IndexHit } from "../../core/src/store/types.js";
import type { NoteKind } from "../../core/src/types/primitives.js";
import { fill, LANGS, type Lang, messages, type Table } from "./i18n.js";
import type { Screen } from "./route.js";
import type { Choice, Job, Selection, View } from "./types.js";

// #region CONST_state
/**
 * @purpose Keep the live state of the page in one object.
 * @invariants A new visit starts on the overview with no selection and no job.
 */
export const state = {
	model: undefined as View | undefined,
	profile: "",
	scope: "",
	screen: "overview" as Screen,
	lang: "en" as Lang,
	theme: "system" as Choice,
	busy: false,
	generation: 0,
	selection: undefined as Selection | undefined,
	hits: [] as readonly IndexHit[],
	query: "",
	kind: "" as NoteKind | "",
	since: "",
	limit: "10",
	searchScope: null as string | null,
	reviewKind: "" as NoteKind | "",
	job: undefined as Job | undefined,
	jobError: "",
};
// #endregion CONST_state

/** The message table of the current language. */
let table: Table = messages("en");

// #region FUNC_tr
/**
 * @purpose Give the message of the current language for one key.
 * @invariants Fill each placeholder from the values. A missing value writes no text.
 */
export function tr(
	key: keyof Table,
	values: Record<string, string | number> = {},
): string {
	return fill(table[key], values);
}
// #endregion FUNC_tr

// #region FUNC_useLang
/**
 * @purpose Put one language on the page and keep its message table.
 * @invariants An unknown code gives English.
 */
export function useLang(code: string): void {
	state.lang = language(code);
	table = messages(state.lang);
}
// #endregion FUNC_useLang

// #region FUNC_chosen
/**
 * @purpose Read one remembered choice.
 * @param key - The local storage key.
 * @param fallback - The value of a first visit or a blocked storage.
 */
export function chosen(key: string, fallback: string): string {
	try {
		return localStorage.getItem(key) ?? fallback;
	} catch {
		return fallback;
	}
}
// #endregion FUNC_chosen

// #region FUNC_remember
/**
 * @purpose Keep one choice for the next visit.
 * @invariants A blocked storage keeps the choice for this page only.
 */
export function remember(key: string, value: string): void {
	try {
		localStorage.setItem(key, value);
	} catch {
		// A blocked storage keeps the choice for this page only.
	}
}
// #endregion FUNC_remember

/** The language code of a browser tag, with English as the fallback. */
function language(code: string): Lang {
	const short = code.slice(0, 2) as Lang;
	return LANGS.includes(short) ? short : "en";
}

/** The theme choice of a stored text, with the system setting as the fallback. */
export function theme(code: string): Choice {
	return code === "light" || code === "dark" ? code : "system";
}
