/**
 * #region moduleContract
 * @purpose Give each screen one prop type, so the shells render a screen without a per-screen
 *   adapter.
 * @scope The props of a console screen. NOT: the screens, the shell, and the transport.
 * @invariants A screen reads the state and the actions from the one API object.
 * @keywords screen, props, api, console, shell
 * #endregion moduleContract
 */

import type { ConsoleApi } from "../model/console.js";

// #region TYPE_ScreenProps
/**
 * @purpose Hold the one input of a console screen.
 * @invariants The screen holds no state of its own that the API does not own.
 */
export type ScreenProps = {
	readonly api: ConsoleApi;
};
// #endregion TYPE_ScreenProps
