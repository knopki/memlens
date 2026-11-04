/**
 * Core module of memlens.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give the frontends one value for the library name, so a rename does not touch each
 * frontend.
 * @scope
 *  - The public value of the library.
 *  - NOT: the CLI, the plugin, the harness, and the user interface.
 * @invariants
 *  - The module imports no package.
 *  - The library does not know the CLI, the plugin, or the user interface.
 * @keywords memlens, library, name
 * #endregion moduleContract
 */

/** The product name. The CLI frontend and the plugin use this value. */
export const NAME = "memlens";
