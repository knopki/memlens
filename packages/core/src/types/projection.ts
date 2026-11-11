/**
 * Record and projection types.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Define the record and projection shapes, so the store and the tree module share one type.
 * @scope
 *  - The record from the projection, the node map, and the scope counter.
 *  - NOT: the event log format, the backend files, or the view rendering.
 * @invariants
 *  - A record has id, pos, scope, state, body, recorded_at, and modified_at.
 *  - The projection schema version grows by one on each change.
 * @keywords record, projection, state, live, hidden, deleted, content_cleared, superseded_by
 * #endregion moduleContract
 */

import type { IsoTime, NoteKind, ScopeKey, Ulid } from "./events.js";
import type { Id, Level, Order, Pos, Rev, TreeNode } from "./tree.js";

/** The state of a record after the projection applies the operations. */
export type RecordState = "live" | "hidden" | "deleted";

/**
 * One record from the projection.
 *
 * The projection makes one record for each note event in pass 1.
 * Pass 2 applies the operations in (at, id) order.
 */
export interface ProjectionRecord {
	readonly id: Ulid;
	readonly scope: ScopeKey;
	readonly pos: Pos;
	/** The latest order of the events that affect this record. */
	readonly order: Order;
	readonly state: RecordState;
	readonly body: string;
	readonly kind: NoteKind;
	readonly ts: IsoTime;
	/** The next review time. The log keeps older values of the date form. */
	readonly review_at: IsoTime | null;
	/** The at of the write of the note. It never changes. */
	readonly recorded_at: IsoTime;
	/** The at of the latest event that affects the record. */
	readonly modified_at: IsoTime;
	readonly longform: string | null;
	readonly refs: readonly string[];
	readonly supersedes: readonly Ulid[];
	readonly superseded_by: Ulid | null;
	/** True when a redact or a sanitized event cleared this record. */
	readonly content_cleared: boolean;
	readonly session: string;
	readonly turn: string;
	readonly preset: string;
}

/**
 * The revision of one (scope, pos) slot: the latest order of the events that touch it.
 * Null when no live record occupies the slot.
 */
export interface SlotRev {
	readonly scope: ScopeKey;
	readonly pos: Pos;
	readonly rev: Rev;
}

/** The current node of a range (level, start). */
export interface RangeNode {
	readonly scope: ScopeKey;
	readonly level: Level;
	readonly start: Pos;
	readonly node: TreeNode;
}

/** The count of live notes in one scope. */
export interface ScopeCount {
	readonly scope: ScopeKey;
	/** One plus the greatest assigned position. Hidden and deleted records still count. */
	readonly total: Pos;
	readonly live: number;
}

/**
 * The full projection snapshot.
 *
 * The store reads the view from the projection without scanning the log.
 */
export interface Projection {
	/** The schema version. Starts at 1. */
	readonly version: number;
	/** All records in the store, by id. */
	readonly records: ReadonlyMap<Ulid, ProjectionRecord>;
	/** All records in position order, by scope and then by pos. */
	readonly byScope: ReadonlyMap<ScopeKey, readonly ProjectionRecord[]>;
	/** The current node of each range, by scope, level, and start. */
	readonly nodes: ReadonlyMap<ScopeKey, readonly TreeNode[]>;
	/** The count of live notes in each scope. */
	readonly scopeCounts: ReadonlyMap<ScopeKey, ScopeCount>;
	/** Scopes in the order of their first real entry. Empty scopes keep their place. */
	readonly scopeOrder: readonly ScopeKey[];
	/** The node ids that must never render: derived from invalidate events. */
	readonly invalidated: ReadonlySet<Id>;
	/** The replay cursor: the last processed local position (SQLite row or JSONL byte offset). */
	readonly cursor: number;
}

/** The current schema version of the projection. */
export const PROJECTION_VERSION = 2;
