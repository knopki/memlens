/**
 * #region moduleContract
 * @purpose Wire one console to the plugin host over the Remote, so a surface holds a store, a
 *   controller, and a port with the identity of that surface.
 * @scope The first state, the local storage, the in-memory address, the Remote mount, the port, and
 *   the probe loop of a store that does not open.
 * NOT: the surface markup, the styles, and the host service.
 * @invariants The port of a session surface sends the session id in the input of each method.
 * @invariants The port of a profile surface sends the profile of the request in the input of each
 *   method, so one panel reads each profile of the base file.
 * @invariants The address stays in memory. A surface reads and writes no page address and no
 *   history.
 * @invariants The API state reads the current snapshot, so the screen store stays stable.
 * @invariants A refused call rejects with an error that carries the cause text of its failure.
 * @invariants A missing namespace rejects each call, so no call falls back to a second transport.
 * @dependencies USES: the console model, the store, the controller, the Remote contribution, and the
 * client context.
 * @keywords client, console, port, store, controller, session, address, storage, remote
 * #endregion moduleContract
 */

import type { IndexHit, SliceLine } from "@memlens/core";
import type {
	ConsoleApi,
	ConsoleRuntime,
	ConsoleState,
	ConsoleStorage,
	OpenedTarget,
	Route,
	StorePort,
	Translate,
	View,
} from "@memlens/ui";
import {
	createConsoleController,
	createConsoleStore,
	DEFAULT_ROUTE,
} from "@memlens/ui";
import {
	CONSOLE_NAMESPACE,
	type ConsoleInputs,
	type ConsoleMethod,
	type ConsoleResults,
	consoleContribution,
} from "../console/remote-contract.js";
import type {
	ClientContext,
	RemoteFailure,
	RemoteNamespace,
} from "./context.js";

/** The text of a call that has no Remote to reach. */
const NO_REMOTE = "The memory transport is not ready.";

/**
 * The delay between two probes of a surface whose store is not open, in milliseconds. The probe
 * reads the host state quietly, and the view load replaces the stated error when the store opens.
 */
export const RETRY_MS = 5_000;

// #region INTERFACE_Mount
/**
 * @purpose Hold the namespace state of one mount and the wait that its calls hold.
 * @invariants The settled wait always resolves, so a call never waits on a dead mount.
 * @invariants An absent namespace means that the mount gave none.
 */
interface Mount {
	readonly settled: Promise<void>;

	/** End the wait of this mount, so a replaced mount leaves no waiting call. */
	readonly settle: () => void;
	namespace?: RemoteNamespace | undefined;
}
// #endregion INTERFACE_Mount

/** The latest mount, so a call waits on the mount that it starts under. */
let current: Mount = { settled: Promise.resolve(), settle: () => {} };

/** The runtime state under construction. Each field is written only when the host gives it. */
interface MutableRuntime {
	session?: string;
	materializedAt?: string;
	snapshotSaved?: boolean;
	store?: { ready: boolean; error: string | null };
	compaction?: {
		attempts: number;
		active: number;
		backoffMs: number;
		failures: number;
		dirty: number;
		provider: string;
		model: string;
		lastRunAt: string | null;
		nextRunAt: string | null;
		lastError: string | null;
		events: {
			at: string;
			kind: "pass" | "call" | "retry" | "error";
			text: string;
		}[];
	};
}

// #region FUNC_retryNeeded
/**
 * @purpose State whether a surface probes the host again: only while the host states a store that
 *   does not open and no model stands.
 */
export function retryNeeded(state: ConsoleState): boolean {
	if (state.model !== undefined) return false;
	return state.runtime?.store?.ready === false;
}
// #endregion FUNC_retryNeeded

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

// #region FUNC_ready
/**
 * @purpose Give the namespace of the mount that the call starts under.
 * @invariants The answer waits for that mount, so a read never races the registration.
 * @invariants The answer reads the namespace of that mount, so no call reads a later mount.
 * @invariants A replaced mount ends its wait, so no call waits on a dead mount.
 */
async function ready(): Promise<RemoteNamespace> {
	const mount = current;
	await mount.settled;
	if (mount.namespace === undefined) throw new Error(NO_REMOTE);
	return mount.namespace;
}
// #endregion FUNC_ready

// #region FUNC_failureOf
/**
 * @purpose Turn one Remote failure into an error that the status line can show.
 * @invariants The text is the message of the cause. The code stays on the error for a caller.
 * @param failure - The failure branch of one answer.
 */
function failureOf(failure: RemoteFailure): Error {
	const error = new Error(
		failure.message || failure.code || "The memory call failed.",
	);
	if (failure.code !== undefined) {
		(error as Error & { code?: string }).code = failure.code;
	}
	console.debug("Remote call refused", { event: "error", code: failure.code });
	return error;
}
// #endregion FUNC_failureOf

// #region FUNC_call
/**
 * @purpose Call one Remote method and unwrap its answer.
 * @invariants The port passes one object with the session field of the tab.
 * @invariants A refused answer rejects, so the controller shows the cause text.
 * @param method - The name of the console method.
 * @param input - The named wire input of the method.
 */
async function call<M extends ConsoleMethod>(
	method: M,
	input: ConsoleInputs[M],
): Promise<ConsoleResults[M]> {
	const api = await ready();
	const invoke = api[method];
	if (invoke === undefined) {
		throw new Error(`${NO_REMOTE} The method ${method} is missing.`);
	}
	const result = await invoke(input);
	if (!result.ok) throw failureOf(result.error);
	return result.value as ConsoleResults[M];
}
// #endregion FUNC_call

// #region FUNC_mountConsole
/**
 * @purpose Mount the Remote contribution of the host for the lifetime of the client plugin.
 * @invariants A failed mount settles the wait with no namespace, so each call reports it.
 * @invariants The disposer withdraws the namespace service and the contribution.
 * @param ctx - The client plugin context.
 */
export function mountConsole(ctx: ClientContext): void {
	ctx.effect(() => {
		let unmount: () => unknown = () => {};
		let withdraw: () => unknown = () => {};
		let settle: () => void = () => {};
		let disposed = false;
		const mount: Mount = {
			settled: new Promise<void>((resolve) => {
				settle = resolve;
			}),
			settle: () => settle(),
		};
		const replaced = current;
		current = mount;
		replaced.namespace = undefined;
		replaced.settle();
		// The inject owns one namespace: clear this mount, so its waits fail. A newer mount
		// keeps its own field, even when both mounts got the same facade object.
		const clear = () => {
			mount.namespace = undefined;
		};
		void (async () => {
			try {
				const mounted = await ctx.remote.$mount(consoleContribution());
				unmount =
					typeof mounted === "function" ? (mounted as () => unknown) : () => {};
				if (disposed) {
					await unmount();
					settle();
					return;
				}
				const fiber = ctx.inject(
					["remote", `remote.${CONSOLE_NAMESPACE}`],
					(scope) => {
						if (disposed) return () => {};
						// A refresh of the same mount injects a newer namespace. Its cleanup
						// must not clear that newer one.
						const injected = scope.remote[CONSOLE_NAMESPACE];
						mount.namespace = injected;
						settle();
						return () => {
							if (mount.namespace === injected) mount.namespace = undefined;
						};
					},
				);
				withdraw = () => fiber.dispose();
				if (disposed) {
					withdraw();
					settle();
					return;
				}
				void Promise.resolve(fiber).then(settle);
				console.debug("Memory Remote mounted", {
					event: "mount",
					namespace: CONSOLE_NAMESPACE,
				});
			} catch (error) {
				settle();
				console.debug("Memory Remote mount failed", {
					event: "error",
					error: String(error),
				});
			}
		})();
		return () => {
			disposed = true;
			withdraw();
			clear();
			void unmount();
			settle();
		};
	}, "memlens: remote");
}
// #endregion FUNC_mountConsole

// #region FUNC_statusOf
/**
 * @purpose Read the host runtime state of one surface, so the maintenance screen shows it.
 * @invariants A missing field stays absent, so the screen renders no empty row.
 * @param surface - The surface of the console.
 * @param profile - The profile of the request. A session surface ignores it.
 */
async function statusOf(
	surface: Surface,
	profile: string,
): Promise<ConsoleRuntime> {
	const value = await call("status", identityOf(surface, profile));
	const runtime: MutableRuntime = {};
	if (value.session !== undefined) runtime.session = value.session;
	const snapshot = value.snapshot;
	if (snapshot !== undefined) {
		if (snapshot.materializedAt)
			runtime.materializedAt = snapshot.materializedAt;
		runtime.snapshotSaved = snapshot.saved;
	}
	if (value.store !== undefined)
		runtime.store = { ready: value.store.ready, error: value.store.error };
	if (value.compaction !== undefined)
		runtime.compaction = {
			attempts: value.compaction.attempts,
			active: value.compaction.active,
			backoffMs: value.compaction.backoff * 1000,
			failures: value.compaction.failures,
			dirty: value.compaction.dirty,
			provider: value.compaction.provider,
			model: value.compaction.model,
			lastRunAt: value.compaction.lastRunAt,
			nextRunAt: value.compaction.nextRunAt,
			lastError: value.compaction.lastError,
			events: value.compaction.events,
		};
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

// #region TYPE_Surface
/**
 * @purpose Name the surface that one console reads: one session or one profile.
 * @invariants A session surface holds the id of its session. A profile surface holds no id, so each
 *   request names its profile.
 */
export type Surface =
	| { readonly kind: "session"; readonly session: string }
	| { readonly kind: "profile" };
// #endregion TYPE_Surface

// #region FUNC_identityOf
/**
 * @purpose Give the surface identity of one wire input.
 * @invariants A session surface sends the session id. A profile surface sends the profile name,
 *   which the host reads as the default profile when it is empty.
 * @param surface - The surface of the console.
 * @param profile - The profile of the request. A session surface ignores it.
 */
function identityOf(
	surface: Surface,
	profile: string,
): { readonly session: string } | { readonly profile: string } {
	return surface.kind === "session"
		? { session: surface.session }
		: { profile };
}
// #endregion FUNC_identityOf

// #region FUNC_portOf
/**
 * @purpose Build the store port of one surface from the mounted namespace.
 * @invariants Each input carries the identity of the surface, because the transport carries no
 *   query.
 * @invariants The wire carries a position as text, as the host operations parse it.
 * @param surface - The surface of the console.
 */
function portOf(surface: Surface): StorePort {
	return {
		view: async (fields) =>
			(await call("view", {
				...identityOf(surface, fields.profile),
				scope: fields.scope,
				kind: fields.kind,
			})) as unknown as View,
		search: async (fields) =>
			(await call("search", {
				...identityOf(surface, fields.profile),
				scope: fields.scope,
				query: fields.query,
				kind: fields.kind,
				since: fields.since,
				limit: fields.limit,
			})) as unknown as readonly IndexHit[],
		open: async (fields) =>
			(await call("open", {
				...identityOf(surface, fields.profile),
				scope: fields.scope,
				target: fields.target,
			})) as unknown as OpenedTarget,
		catalog: async (fields) =>
			(await call("catalog", {
				...identityOf(surface, fields.profile),
				scope: fields.scope,
				start: String(fields.start),
				level: String(fields.level),
			})) as unknown as readonly SliceLine[],
		action: (name, fields) =>
			call("action", {
				...identityOf(surface, String(fields.profile ?? "")),
				scope: String(fields.scope ?? ""),
				...fields,
				action: name as ConsoleInputs["action"]["action"],
			}),
	};
}
// #endregion FUNC_portOf

// #region FUNC_createConsole
/**
 * @purpose Build the console of one surface from its identity and its translate function.
 * @invariants The port sends the identity of the surface in the input of each method.
 * @invariants The route pair keeps the address in memory, so the harness page keeps its own address.
 * @param surface - The session or the profile surface of the console.
 * @param t - The translate function of the surface.
 */
export function createConsole(surface: Surface, t: Translate): ConsoleApi {
	const store = createConsoleStore(initialState());
	let route: Route = DEFAULT_ROUTE;
	const port = portOf(surface);
	port.runtime = () => statusOf(surface, store.getSnapshot().profile);
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
	console.debug("Console ready", { event: "start", surface: surface.kind });
	return {
		get state(): ConsoleState {
			return store.getSnapshot();
		},
		subscribe: store.subscribe,
		t,
		call,
	};
}
// #endregion FUNC_createConsole

// #region FUNC_createSessionConsole
/**
 * @purpose Build the console of one session, so the tab shows the state of that session.
 * @invariants The port sends the session id in the input of each method.
 * @param sessionId - The session id that the slot inject gives.
 * @param t - The translate function of the tab.
 */
export function createSessionConsole(
	sessionId: string,
	t: Translate,
): ConsoleApi {
	return createConsole({ kind: "session", session: sessionId }, t);
}
// #endregion FUNC_createSessionConsole

// #region FUNC_createProfileConsole
/**
 * @purpose Build the console of the profiles of the base file, so the page reads each profile.
 * @invariants The console starts on the default profile of the base file.
 * @param t - The translate function of the page.
 */
export function createProfileConsole(t: Translate): ConsoleApi {
	return createConsole({ kind: "profile" }, t);
}
// #endregion FUNC_createProfileConsole
