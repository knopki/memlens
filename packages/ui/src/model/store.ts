/**
 * #region moduleContract
 * @purpose Hold the console state in one observable store, so a React shell reads it through
 * useSyncExternalStore.
 * @scope The snapshot, the patch, and the listener list. NOT: the behaviour, the DOM, the storage,
 * and the transport.
 * @invariants The snapshot keeps its reference until a change. A set gives a new state object.
 * @invariants The store holds no DOM, no storage, and no fetch.
 * @dependencies USES TYPE: the console state contract.
 * @keywords store, state, snapshot, subscribe, patch
 * #endregion moduleContract
 */

import type { ConsoleState } from "./console.js";

// #region INTERFACE_ConsoleStore
/**
 * @purpose Give one console state to the controller and to the shell.
 * @invariants The snapshot keeps its reference until a change, so useSyncExternalStore is stable.
 * @invariants A listener takes no argument. The shell reads the snapshot after the call.
 */
export interface ConsoleStore {
	getSnapshot(): ConsoleState;
	set(patch: Partial<ConsoleState>): void;
	subscribe(listener: () => void): () => void;
}
// #endregion INTERFACE_ConsoleStore

// #region FUNC_createConsoleStore
/**
 * @purpose Build one store from the first state of a page.
 * @invariants Each set gives a new state object and calls each listener once.
 * @invariants The returned unsubscribe function removes its listener.
 * @param initial - The state of the first visit.
 */
export function createConsoleStore(initial: ConsoleState): ConsoleStore {
	let state = initial;
	const listeners = new Set<() => void>();
	return {
		getSnapshot: () => state,
		set(patch) {
			state = { ...state, ...patch };
			for (const listener of listeners) listener();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
// #endregion FUNC_createConsoleStore
