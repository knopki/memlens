/**
 * #region moduleContract
 * @purpose Build the fakes of one console test: a store port, a storage, a state, and a harness
 * with a controlled address.
 * @scope The view, the entry, the state, the port calls, and the harness.
 * @invariants The fakes hold no network, no DOM, and no local storage.
 * @keywords test, fake, port, storage, harness, state
 * #endregion moduleContract
 */

import type { ConsoleEntry, ScopeKey } from "@memlens/core";
import type {
	ConsoleActions,
	ConsoleState,
	ConsoleStorage,
	StorePort,
} from "../../src/model/console.js";
import { createConsoleController } from "../../src/model/controller.js";
import {
	type ConsoleStore,
	createConsoleStore,
} from "../../src/model/store.js";
import type { Route } from "../../src/route.js";
import type { Step, View } from "../../src/types.js";

// #region FUNC_viewOf
/**
 * @purpose Build one console view for a test.
 * @param profile - The profile name.
 * @param scope - The selected scope.
 * @param patch - The fields that the test changes.
 */
export function viewOf(
	profile = "default",
	scope: ScopeKey = "project:alpha",
	patch: Partial<View> = {},
): View {
	return {
		screen: "overview",
		profile,
		scope,
		scopes: [],
		revision: "rev-1",
		text: "",
		budgets: {
			here: { used: 0, limit: 10 },
			directions: { used: 0, limit: 10 },
		},
		frontier: [],
		catalog: [],
		catalogScopes: [],
		review: [],
		reviewTotal: 0,
		reviewNext: [],
		reviewNextTotal: 0,
		candidates: [],
		totals: { records: 0, nodes: 0, candidates: 0 },
		levels: [],
		proposals: [],
		profiles: [profile],
		path: "/tmp/memlens.db",
		backend: "fake",
		allowDelete: false,
		reviewPolicy: {
			decision: 7,
			preference: 30,
			fact: 30,
			gotcha: 30,
			task: 7,
			note: 30,
		},
		...patch,
	};
}
// #endregion FUNC_viewOf

// #region FUNC_entryOf
/**
 * @purpose Build one open entry for a test.
 * @param patch - The fields that the test changes.
 */
export function entryOf(
	scope: ScopeKey,
	pos: number,
	patch: Partial<ConsoleEntry> = {},
): ConsoleEntry {
	return {
		kind: "entry",
		addr: `${scope}#${pos}`,
		pos,
		id: `${scope}#${pos}`,
		ts: "2026-11-14T10:00:00.000Z",
		scope,
		body: "body",
		longform: "",
		longformChars: 0,
		longformOffset: 0,
		longformTruncated: false,
		review_at: null,
		modified_at: "2026-11-14T10:00:00.000Z",
		refs: [],
		noteKind: "fact",
		state: "live",
		session: "test",
		preset: "test",
		supersedes: [],
		superseded_by: null,
		...patch,
	};
}
// #endregion FUNC_entryOf

// #region FUNC_stateOf
/**
 * @purpose Build one first state for a test.
 * @param patch - The fields that the test changes.
 */
export function stateOf(patch: Partial<ConsoleState> = {}): ConsoleState {
	return {
		model: undefined,
		profile: "default",
		scope: "project:alpha",
		screen: "overview",
		lang: "en",
		theme: "system",
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
		...patch,
	};
}
// #endregion FUNC_stateOf

// #region FUNC_routeOfState
/**
 * @purpose Give the address of one state, so a test starts on its own place.
 */
export function routeOfState(state: ConsoleState): Route {
	return {
		screen: state.screen,
		profile: state.profile,
		scope: state.scope,
		target: state.selection?.target ?? "",
		query: state.query,
		searchScope: state.searchScope,
		kinds: state.kinds,
		since: state.since,
		until: state.until,
		due: state.due,
		limit: state.limit,
		reviewKind: state.reviewKind,
	};
}
// #endregion FUNC_routeOfState

// #region INTERFACE_FakeStorage
/**
 * @purpose Hold the written choices of one test storage.
 */
export interface FakeStorage extends ConsoleStorage {
	readonly data: Record<string, string>;
}
// #endregion INTERFACE_FakeStorage

// #region FUNC_fakeStorage
/**
 * @purpose Build one storage in memory.
 */
export function fakeStorage(): FakeStorage {
	const data: Record<string, string> = {};
	return {
		data,
		read: (key, fallback) => data[key] ?? fallback,
		write: (key, value) => {
			data[key] = value;
		},
	};
}
// #endregion FUNC_fakeStorage

// #region INTERFACE_PortCall
/**
 * @purpose Hold one call to the fake port.
 */
export interface PortCall {
	readonly method: string;
	readonly name?: string;
	readonly fields: object;
}
// #endregion INTERFACE_PortCall

// #region FUNC_fakePort
/**
 * @purpose Build one port that records each call and answers from simple values.
 * @param overrides - The methods that the test replaces.
 */
export function fakePort(overrides: Partial<StorePort> = {}): {
	port: StorePort;
	calls: PortCall[];
} {
	const calls: PortCall[] = [];
	const port: StorePort = {
		async view(fields) {
			calls.push({ method: "view", fields });
			if (overrides.view) return overrides.view(fields);
			return viewOf(
				fields.profile || "default",
				(fields.scope || "project:alpha") as ScopeKey,
				{
					screen: fields.screen ?? "overview",
				},
			);
		},
		async search(fields) {
			calls.push({ method: "search", fields });
			if (overrides.search) return overrides.search(fields);
			return [];
		},
		async open(fields) {
			calls.push({ method: "open", fields });
			if (overrides.open) return overrides.open(fields);
			return entryOf((fields.scope || "project:alpha") as ScopeKey, 1);
		},
		async catalog(fields) {
			calls.push({ method: "catalog", fields });
			if (overrides.catalog) return overrides.catalog(fields);
			return [];
		},
		async action(name, fields) {
			calls.push({ method: "action", name, fields });
			if (overrides.action) return overrides.action(name, fields);
			return { ok: true };
		},
	};
	if (overrides.runtime !== undefined) {
		const runtime = overrides.runtime;
		port.runtime = async () => {
			calls.push({ method: "runtime", fields: {} });
			return runtime();
		};
	}
	return { port, calls };
}
// #endregion FUNC_fakePort

// #region INTERFACE_Harness
/**
 * @purpose Give one test the controller, the store, the storage, and the address writes.
 */
export interface Harness {
	readonly store: ConsoleStore;
	readonly call: ConsoleActions;
	readonly storage: FakeStorage;
	readonly calls: PortCall[];
	readonly writes: { route: Route; step: Step }[];

	/** The texts that the controller put into the clipboard of the test. */
	readonly clipboard: string[];
	state(): ConsoleState;
	setRoute(route: Route): void;
}
// #endregion INTERFACE_Harness

// #region FUNC_harness
/**
 * @purpose Build one controller with a fake port, a fake storage, and an address in memory.
 * @param overrides - The port methods that the test replaces.
 * @param patch - The state fields that the test changes.
 */
export function harness(
	overrides: Partial<StorePort> = {},
	patch: Partial<ConsoleState> = {},
	clipboardFails = false,
): Harness {
	const { port, calls } = fakePort(overrides);
	const storage = fakeStorage();
	const initial = stateOf(patch);
	const store = createConsoleStore(initial);
	const writes: { route: Route; step: Step }[] = [];
	const clipboard: string[] = [];
	let route = routeOfState(initial);
	const call = createConsoleController({
		port,
		storage,
		store,
		t: (key) => key,
		readRoute: () => route,
		writeRoute: (next, step) => {
			writes.push({ route: next, step });
			route = next;
		},
		clipboard: async (text: string) => {
			if (clipboardFails) throw new Error("denied");
			clipboard.push(text);
		},
	});
	return {
		store,
		call,
		storage,
		calls,
		writes,
		clipboard,
		state: () => store.getSnapshot(),
		setRoute: (next) => {
			route = next;
		},
	};
}
// #endregion FUNC_harness

// #region FUNC_deferred
/**
 * @purpose Hold a promise that a test resolves at its chosen time.
 */
export function deferred<T>(): {
	promise: Promise<T>;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
} {
	let resolve = (value: T): void => {
		void value;
	};
	let reject = (error: unknown): void => {
		void error;
	};
	const promise = new Promise<T>((accept, decline) => {
		resolve = accept;
		reject = decline;
	});
	return { promise, resolve, reject };
}
// #endregion FUNC_deferred
