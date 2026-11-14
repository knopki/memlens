/**
 * #region moduleContract
 * @purpose Wire one console to the plugin host over the Remote, so the tab holds a store, a
 *   controller, and a port with the session of its own slot.
 * @scope The first state, the local storage, the in-memory address, the Remote mount, and the port.
 * NOT: the tab markup, the styles, and the host service.
 * @invariants The port sends the session id of the tab in the input of each method.
 * @invariants The address stays in memory. The tab reads and writes no page address and no history.
 * @invariants The API state reads the current snapshot, so the screen store stays stable.
 * @invariants A refused call rejects with an error that carries the cause text of its failure.
 * @invariants A missing namespace rejects each call, so no call falls back to a second transport.
 * @dependencies USES: the console model, the store, the controller, the Remote contribution, and the
 * client context.
 * @keywords client, console, port, store, controller, session, address, storage, remote
 * #endregion moduleContract
 */

import type { IndexHit } from "../../../core/src/store/types.js";
import type { SliceLine } from "../../../core/src/types/tree.js";
import type {
	ConsoleApi,
	ConsoleRuntime,
	ConsoleState,
	ConsoleStorage,
	OpenedTarget,
	StorePort,
	Translate,
} from "../../../ui/src/model/console.js";
import { createConsoleController } from "../../../ui/src/model/controller.js";
import { createConsoleStore } from "../../../ui/src/model/store.js";
import { DEFAULT_ROUTE, type Route } from "../../../ui/src/route.js";
import type { View } from "../../../ui/src/types.js";
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
	nextTrigger?: string;
	snapshotSaved?: boolean;
	compaction?: {
		attempts: number;
		active: number;
		backoffMs: number;
		failures: number;
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
 * @purpose Read the host runtime state of one session, so the maintenance screen shows it.
 * @invariants A missing field stays absent, so the screen renders no empty row.
 * @param sessionId - The session id of the tab.
 */
async function statusOf(sessionId: string): Promise<ConsoleRuntime> {
	const value = await call("status", { session: sessionId });
	const runtime: MutableRuntime = { session: value.session };
	if (value.snapshot.materializedAt) {
		runtime.materializedAt = value.snapshot.materializedAt;
	}
	const next = value.snapshot.nextRefreshAt ?? value.snapshot.nextTrigger;
	if (next) runtime.nextTrigger = next;
	runtime.snapshotSaved = value.snapshot.saved;
	runtime.compaction = {
		attempts: value.compaction.attempts,
		active: value.compaction.active,
		backoffMs: value.compaction.backoff * 1000,
		failures: value.compaction.failures,
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

// #region FUNC_portOf
/**
 * @purpose Build the store port of one session from the mounted namespace.
 * @invariants Each input carries the session id of the tab, because the transport carries no query.
 * @invariants The wire carries a position as text, as the host operations parse it.
 */
function portOf(sessionId: string): StorePort {
	return {
		view: async (fields) =>
			(await call("view", {
				session: sessionId,
				profile: fields.profile,
				scope: fields.scope,
				kind: fields.kind,
			})) as unknown as View,
		search: async (fields) =>
			(await call("search", {
				session: sessionId,
				profile: fields.profile,
				scope: fields.scope,
				query: fields.query,
				kind: fields.kind,
				since: fields.since,
				limit: fields.limit,
			})) as unknown as readonly IndexHit[],
		open: async (fields) =>
			(await call("open", {
				session: sessionId,
				profile: fields.profile,
				scope: fields.scope,
				target: fields.target,
			})) as unknown as OpenedTarget,
		catalog: async (fields) =>
			(await call("catalog", {
				session: sessionId,
				profile: fields.profile,
				scope: fields.scope,
				start: String(fields.start),
				level: String(fields.level),
			})) as unknown as readonly SliceLine[],
		action: (name, fields) =>
			call("action", {
				session: sessionId,
				profile: String(fields.profile ?? ""),
				scope: String(fields.scope ?? ""),
				...fields,
				action: name as ConsoleInputs["action"]["action"],
			}),
	};
}
// #endregion FUNC_portOf

// #region FUNC_createTabConsole
/**
 * @purpose Build the console of one tab from its session id and its translate function.
 * @invariants The port sends the session id in the input of each method.
 * @invariants The route pair keeps the address in memory, so the harness page keeps its own address.
 * @param sessionId - The session id that the slot inject gives.
 * @param t - The translate function of the tab.
 */
export function createTabConsole(sessionId: string, t: Translate): ConsoleApi {
	const store = createConsoleStore(initialState());
	let route: Route = DEFAULT_ROUTE;
	const port = portOf(sessionId);
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
