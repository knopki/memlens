/**
 * #region moduleContract
 * @purpose Give a host the surface of the console, so a host holds no file path into the console.
 * @scope The message tables, the route names, the console model and its two factories, the screen
 *   registry, and the note dialog. NOT: the shells, the transport, the styles, and the screens.
 * @invariants The file names each module that a host uses. A host takes no other module.
 * @invariants The modules of this package import each other by a relative path, so the package holds
 *   no import of itself.
 * @dependencies USES: the modules of this package.
 * @keywords console, package, surface, entry, host, barrel
 * #endregion moduleContract
 */

export { NoteDialog } from "./components/note-dialog.js";
export { SCREEN_COMPONENTS } from "./components/screens/index.js";
export {
	fill,
	LANGS,
	type Lang,
	MESSAGES,
	messages,
	type Table,
} from "./i18n.js";

export type {
	ConsoleActions,
	ConsoleApi,
	ConsoleRuntime,
	ConsoleState,
	ConsoleStorage,
	OpenedTarget,
	StorePort,
	Translate,
} from "./model/console.js";

export { createConsoleController } from "./model/controller.js";
export { createConsoleStore } from "./model/store.js";
export { DEFAULT_ROUTE, type Route, SCREENS, type Screen } from "./route.js";

export type { Choice, View } from "./types.js";
