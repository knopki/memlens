/**
 * #region moduleContract
 * @purpose Wire one console to the plugin host, so the tab holds a store, a controller, and a port
 *   with the session of its own slot.
 * @scope The first state, the local storage, the in-memory address, and the API object.
 * NOT: the tab markup, the styles, and the host route.
 * @invariants The port sends the session id of the tab on every request.
 * @invariants The address stays in memory. The tab reads and writes no page address and no history.
 * @invariants The API state reads the current snapshot, so the screen store stays stable.
 * @dependencies USES: the console model, the store, the controller, the transport, the route, and
 * the plugin console route at `/plugins/memlens`.
 * @keywords client, console, port, store, controller, session, address, storage
 * #endregion moduleContract
 */

import type {
	ConsoleApi,
	ConsoleRuntime,
	ConsoleState,
	ConsoleStorage,
	Translate,
} from "../../../ui/src/model/console.js";
import { createConsoleController } from "../../../ui/src/model/controller.js";
import { createConsoleStore } from "../../../ui/src/model/store.js";
import { createHttpPort } from "../../../ui/src/model/transport.js";
import { DEFAULT_ROUTE, type Route } from "../../../ui/src/route.js";

/** The route prefix of the plugin console. */
const BASE = "/plugins/memlens";

/** The runtime state under construction. Each field is written only when the host gives it. */
interface MutableRuntime {
	session?: string;
	materializedAt?: string;
	nextTrigger?: string;
	snapshotSaved?: boolean;
	compaction?: {
		attempts: number;
		active: number;
		backoffMs: number;
		failures: number;
	};
}

/** The status answer of the plugin console route. */
interface HostStatus {
	readonly session?: string;
	readonly scope?: string;
	readonly snapshot?: {
		readonly saved: boolean;
		readonly chars: number;
		readonly materializedAt: string | null;
		readonly nextTrigger: string;
		readonly nextRefreshAt: string | null;
	};
	readonly compaction?: {
		readonly attempts: number;
		readonly active: number;
		readonly backoff: number;
		readonly failures: number;
		readonly dirty: number;
	};
}

// #region FUNC_initialState
/**
 * @purpose Give the state of a first visit: the overview of the default profile with no filter.
 * @invariants The state holds the status line and no dialog, as the controller expects.
 */
function initialState(): ConsoleState {
	return {
		model: undefined,
		profile: "",
		scope: "",
		screen: DEFAULT_ROUTE.screen,
		lang: "en",
		theme: "system",
		busy: false,
		generation: 0,
		selection: undefined,
		hits: [],
		query: "",
		kind: "",
		since: "",
		limit: DEFAULT_ROUTE.limit,
		searchScope: null,
		reviewKind: "",
		job: undefined,
		jobError: "",
		status: { text: "", error: false },
		dialog: null,
	};
}
// #endregion FUNC_initialState

// #region FUNC_statusOf
/**
 * @purpose Read the host runtime state of one session, so the maintenance screen shows it.
 * @invariants A missing field stays absent, so the screen renders no empty row.
 * @param sessionId - The session id of the tab.
 */
async function statusOf(sessionId: string): Promise<ConsoleRuntime> {
	const search = new URLSearchParams({ session: sessionId }).toString();
	const response = await fetch(`${BASE}/status?${search}`, {
		cache: "no-store",
	});
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const value = (await response.json()) as HostStatus;
	const runtime: MutableRuntime = {};
	if (value.session !== undefined) runtime.session = value.session;
	if (value.snapshot?.materializedAt) {
		runtime.materializedAt = value.snapshot.materializedAt;
	}
	const next = value.snapshot?.nextRefreshAt ?? value.snapshot?.nextTrigger;
	if (next) runtime.nextTrigger = next;
	if (value.snapshot !== undefined)
		runtime.snapshotSaved = value.snapshot.saved;
	if (value.compaction !== undefined) {
		runtime.compaction = {
			attempts: value.compaction.attempts,
			active: value.compaction.active,
			backoffMs: value.compaction.backoff * 1000,
			failures: value.compaction.failures,
		};
	}
	return runtime;
}
// #endregion FUNC_statusOf

// #region FUNC_createStorage
/**
 * @purpose Keep the language and theme choice of the console in the page storage.
 * @invariants A blocked storage keeps the choice for this tab only.
 * @invariants The keys carry the `memlens.` prefix, as the standalone console uses.
 */
function createStorage(): ConsoleStorage {
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
				// A blocked storage keeps the choice for this tab only.
			}
		},
	};
}
// #endregion FUNC_createStorage

// #region FUNC_createTabConsole
/**
 * @purpose Build the console of one tab from its session id and its translate function.
 * @invariants The port sends the session id on each request.
 * @invariants The route pair keeps the address in memory, so the harness page keeps its own address.
 * @param sessionId - The session id that the slot inject gives.
 * @param t - The translate function of the tab.
 */
export function createTabConsole(sessionId: string, t: Translate): ConsoleApi {
	const store = createConsoleStore(initialState());
	let route: Route = DEFAULT_ROUTE;
	const port = createHttpPort(BASE, t, sessionId);
	port.runtime = () => statusOf(sessionId);
	const call = createConsoleController({
		port,
		storage: createStorage(),
		store,
		t,
		readRoute: () => route,
		writeRoute: (next) => {
			route = next;
		},
	});
	console.debug("Tab console ready", { event: "start", session: sessionId });
	return {
		get state(): ConsoleState {
			return store.getSnapshot();
		},
		subscribe: store.subscribe,
		t,
		call,
	};
}
// #endregion FUNC_createTabConsole
