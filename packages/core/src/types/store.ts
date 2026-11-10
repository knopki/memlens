/**
 * Store port types.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Define the abstract store interface, so the domain and the tree logic depend on no backend.
 * @scope
 *  - Store operations, revisions, index records, and complete search hits.
 *  - NOT: the backend implementations, the JSONL file, or the SQLite file.
 * @invariants
 *  - A store port gives one projection per read.
 *  - Writers hold the publication lock through validation and source publication.
 *  - Source events, generated invalidations, projection, and revision publish together.
 *  - A failure before publication leaves the source unchanged. A cleanup failure preserves the published source.
 *  - SQLite uses a revision counter. JSONL uses a file fingerprint.
 *  - The index accepts projected records and returns complete search hits.
 *  - Both backends give the same complete hits for the same source and query.
 * @dependencies
 *  USES: events.ts, tree.ts, projection.ts
 * @keywords store, port, append, projection, storeRev, backend
 * #endregion moduleContract
 */

import type {
	Event,
	JsonlLine,
	NodeEvent,
	NoteKind,
	ScopeKey,
	Ulid,
} from "./events.js";
import type { Projection, ProjectionRecord } from "./projection.js";
import type { BuildInput, TreeNode } from "./tree.js";

/** A write retains the payload of each operation and lets the store supply its envelope. */
export type AppendEvent = Event extends infer Operation
	? Operation extends Event
		? Omit<Operation, "id" | "at">
		: never
	: never;

/** The SQLite revision counter or the JSONL file fingerprint, as a string. */
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

	/** Read the current projection. An unchanged source requires no event scan. */
	projection(): Promise<Projection>;

	/** Read the store revision. The revision changes on each write, including redacts. */
	rev(): Promise<StoreRev>;

	/**
	 * Search the store index through the index port.
	 * A null scope searches each scope. The limit caps the hits of the query.
	 */
	search(
		query: string,
		scope: ScopeKey | null,
		limit: number,
	): Promise<readonly IndexHit[]>;

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

// #region CLASS_IndexHit
/** @purpose Supply the full record metadata and body for one search result. */
export interface IndexHit {
	readonly addr: string;
	readonly scope: ScopeKey;
	readonly pos: number;
	readonly id: string;
	readonly ts: string;
	readonly kind: NoteKind;
	readonly body: string;
	readonly longformChars: number;
	readonly review_at: string | null;
}
// #endregion CLASS_IndexHit

// #region CLASS_IndexPort
/**
 * @purpose Keep search results complete through one backend-independent index contract.
 * @invariants Add accepts a complete projected record, with metadata and longform. Search returns complete hits without longform content.
 * @invariants Rebuild derives current records from events. SQLite updates the index within the source transaction.
 */
export interface IndexPort {
	/** Add the current record with its metadata and longform. Part of the SQLite source transaction. */
	add(record: ProjectionRecord): Promise<void>;

	/** Remove one record from the index. */
	remove(id: Ulid): Promise<void>;

	/** Search the index for the given query. Return complete hits with each longform length. */
	search(
		query: string,
		scope: ScopeKey | null,
		limit: number,
	): Promise<readonly IndexHit[]>;

	/** Rebuild the index from the given events. Called after a language change or index loss. */
	rebuild(events: readonly JsonlLine[]): Promise<void>;

	/** Close the index. */
	close(): Promise<void>;
}
// #endregion CLASS_IndexPort
