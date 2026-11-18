/**
 * #region moduleContract
 * @purpose Give a browser bundle the pure exports of the library through one subpath.
 * @invariants A browser bundle takes this subpath and never the root, because the root imports
 *   Node.js modules.
 * #endregion moduleContract
 */

export { dateSpan } from "./domain/date-span.js";
export { NOTE_KINDS } from "./types/primitives.js";
