/**
 * #region moduleContract
 * @purpose Give a browser client the pure values of the library, without the Node.js part of it.
 * @scope The text helpers of the view, and the list of the note kinds. NOT: the store, the
 *   configuration, the slice, and the process.
 * @invariants The module imports no Node.js module, so a browser bundle takes this module alone.
 * @invariants The module holds no store function, no file access, and no configuration.
 * @dependencies USES: the pure domain helpers of this package.
 * @keywords view, text, format, browser, subpath, pure, kind
 * #endregion moduleContract
 */

export { dateSpan } from "./domain/date-span.js";
export { NOTE_KINDS } from "./types/primitives.js";
