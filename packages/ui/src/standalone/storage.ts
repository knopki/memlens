/**
 * #region moduleContract
 * @purpose Keep the language and theme choice between visits, so a human opens the console in the
 * same language and theme.
 * @scope The two local storage calls and the fallback of a blocked storage. NOT: the choice rules
 * and the markup.
 * @invariants A blocked storage keeps the choice for this page only and throws no error.
 * @dependencies READS: localStorage; WRITES: localStorage
 * @keywords storage, local storage, language, theme, fallback
 * #endregion moduleContract
 */

import type { ConsoleStorage } from "../model/console.js";

// #region FUNC_createLocalStorage
/**
 * @purpose Give the console the browser storage, with a fallback for a blocked storage.
 * @invariants A blocked read gives the fallback value. A blocked write keeps the value of this page.
 */
export function createLocalStorage(): ConsoleStorage {
	return {
		read(key, fallback) {
			try {
				return localStorage.getItem(key) ?? fallback;
			} catch {
				return fallback;
			}
		},
		write(key, value) {
			try {
				localStorage.setItem(key, value);
			} catch {
				// A blocked storage keeps the choice for this page only.
			}
		},
	};
}
// #endregion FUNC_createLocalStorage
