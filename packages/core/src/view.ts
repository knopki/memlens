/**
 * #region moduleContract
 * @purpose Give a browser client the text helpers of a range line, without the Node.js part of the
 *   library.
 * @scope The pure text helpers of the view. NOT: the store, the configuration, the slice, and the
 *   process.
 * @invariants The module imports no Node.js module, so a browser bundle takes this module alone.
 * @invariants The module holds no store function, no file access, and no configuration.
 * @dependencies USES: the pure domain helpers of this package.
 * @keywords view, text, format, browser, subpath, pure
 * #endregion moduleContract
 */

export { dateSpan } from "./domain/date-span.js";
