/**
 * #region moduleContract
 * @purpose Give a browser bundle the pure exports of the library through one subpath.
 * @invariants A browser bundle takes this subpath and never the root, because the root imports
 *   Node.js modules.
 * @invariants A module of this subpath imports no Node.js module.
 * #endregion moduleContract
 */

export {
	readRange,
	renderAddress,
	renderRange,
} from "./domain/address-form.js";
export { dateSpan } from "./domain/date-span.js";
export { dayOf } from "./domain/day.js";
export { CONSOLE_SCREENS, NOTE_KINDS } from "./types/primitives.js";
