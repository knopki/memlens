/**
 * Store port types.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Define the abstract store interface, so the domain and the tree logic depend on no backend.
 * @scope
 *  - The AppendEvent input, the WriteResult, and the StorePort interface.
 *  - NOT: the backend implementations, the JSONL file, or the SQLite file.
 * @invariants
 *  - A store port gives one projection per read.
 *  - An append is atomic: a failed append leaves no event in the store.
 * @dependencies
 *  USES: events.ts, tree.ts, projection.ts
 * @keywords store, port, append, projection, storeRev, backend
 * #endregion moduleContract
 */

import type { Event, JsonlLine, NodeEvent, ScopeKey, Ulid } from "./events.js";
import type { Projection } from "./projection.js";
import type { BuildInput, TreeNode } from "./tree.js";

/** A write retains the payload of each operation and lets the store supply its envelope. */
export type AppendEvent = Event extends infer Operation
	? Operation extends Event
		? Omit<Operation, "id" | "at">
		: never
	: never;

/** A unique string that identifies the state of the store. */
export type StoreRev = string;

/** The result of a node append: either accepted or rejected (input changed). */
export type NodeAppendResult =
	| { readonly ok: true; readonly node: TreeNode }
	| { readonly ok: false; readonly reason: "input_changed" | "empty_children" };

/**
 * The abstract store port.
 *
 * Both the SQLite backend and the JSONL backend implement this interface.
 * The domain and the tree logic depend on this interface only.
 */
export interface StorePort {
	/**
	 * Append one event to the log and update the projection.
	 * Returns the appended event with its id and at filled in.
	 */
	append(event: AppendEvent): Promise<Event>;

	/**
	 * Append a node event under the write lock, verifying the build input has not changed.
	 * Rejects when the input changed since the job copied it.
	 */
	appendNode(
		input: BuildInput,
		node: Omit<NodeEvent, "id" | "at">,
	): Promise<NodeAppendResult>;

	/** Read the current projection. This call scans no event. */
	projection(): Promise<Projection>;

	/** Read the store revision. The revision changes on each write, including redacts. */
	rev(): Promise<StoreRev>;

	/**
	 * Export the events of one scope, or all events when scope is null.
	 * The export runs under a read lock so the copy is consistent.
	 */
	export(scope: ScopeKey | null): Promise<readonly JsonlLine[]>;

	/**
	 * Import events by id union.
	 * A sanitized copy wins over an unsanitized copy of the same id.
	 * Returns the count of imported events.
	 */
	import(events: readonly JsonlLine[]): Promise<number>;

	/** Close any open handles and flush any pending writes. */
	close(): Promise<void>;
}

/** The FTS index port. Each backend has one implementation. */
export interface IndexPort {
	/** Add one record to the index. Part of the append transaction in SQLite. */
	add(
		id: Ulid,
		scope: ScopeKey,
		body: string,
		longform: string | null,
	): Promise<void>;

	/** Remove one record from the index. */
	remove(id: Ulid): Promise<void>;

	/** Search the index for the given query. Returns the matching ids. */
	search(
		query: string,
		scope: ScopeKey | null,
		limit: number,
	): Promise<readonly Ulid[]>;

	/** Rebuild the index from the given events. Called after a language change or index loss. */
	rebuild(events: readonly JsonlLine[]): Promise<void>;

	/** Close the index. */
	close(): Promise<void>;
}
