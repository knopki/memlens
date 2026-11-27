/**
 * #region moduleContract
 * @purpose Start the standalone console in the browser, so one bundle builds the store, the HTTP
 * port, the storage, the controller, and the React shell of one host.
 * @scope The first state, the store, the text function, the API, the theme of the first paint, and
 * the first restore. NOT: the shell, the screens, and the transport.
 * @invariants The address decides the first place of a visit.
 * @invariants The stored language and theme survive a reload. A blocked storage gives the browser
 * language and the system theme.
 * @dependencies USES API: react-dom
 * @keywords entry, standalone, bootstrap, store, port, api, restore
 * #endregion moduleContract
 */

import { createRoot } from "react-dom/client";
import { fill, messages } from "../i18n.js";
import type { ConsoleApi, ConsoleState, Translate } from "../model/console.js";
import {
	createConsoleController,
	LANG_KEY,
	languageOf,
	THEME_KEY,
	themeOf,
} from "../model/controller.js";
import { createConsoleStore } from "../model/store.js";
import { createHttpPort } from "../model/transport.js";
import { readRoute } from "../route.js";
import { writeAddress } from "./address.js";
import { App } from "./app.js";
import { createLocalStorage } from "./storage.js";
import { applyTheme } from "./theme.js";

const storage = createLocalStorage();

const lang = languageOf(storage.read(LANG_KEY, navigator.language));

const theme = themeOf(storage.read(THEME_KEY, "system"));

const initial: ConsoleState = {
	model: undefined,
	profile: "",
	scope: "",
	screen: "overview",
	lang,
	theme,
	busy: false,
	generation: 0,
	selection: undefined,
	hits: [],
	query: "",
	kinds: [],
	since: "",
	until: "",
	due: false,
	limit: "10",
	searchScope: null,
	reviewKind: "",
	job: undefined,
	jobError: "",
	status: { text: "", error: false },
	dialog: null,
};

const store = createConsoleStore(initial);

// #region FUNC_textOf
/**
 * @purpose Give the message of one key in the language of the current state.
 */
const t: Translate = (key, values = {}) =>
	fill(messages(store.getSnapshot().lang)[key], values);
// #endregion FUNC_textOf

const api: ConsoleApi = {
	get state() {
		return store.getSnapshot();
	},
	subscribe: store.subscribe,
	t,
	call: createConsoleController({
		port: createHttpPort("/api", t),
		storage,
		store,
		t,
		readRoute: () => readRoute(location.search),
		writeRoute: writeAddress,
	}),
};

applyTheme(theme);

const root = document.getElementById("app");
if (!root) throw new Error("Console root is absent");
root.classList.add("ml-console");
createRoot(root).render(<App api={api} />);
void api.call.restore(readRoute(location.search));
