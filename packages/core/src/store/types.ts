/**
 * #region moduleContract
 * @modulecontract
 * @purpose Define the row shapes of one SQLite-backed memory, so each module names one shape.
 * @scope Notes, nodes, proposals, and their field groups. NOT: SQL, locks, and files.
 * @invariants A node covers the slot range `[start, start + 2^level)` of one scope.
 * @dependencies types/primitives.ts for Ulid and NoteKind.
 * @keywords note, node, proposal, scope, slot, state, version
 * #endregion moduleContract
 */

import type { NoteKind, ScopeKey, Ulid } from "../types/primitives.js";

/** The lifecycle state. It never moves backwards. */
export type NoteState = "live" | "hidden" | "deleted";

/** The public status of one proposal. */
export type ProposalStatus = "open" | "accepted" | "dismissed" | "expired";

/** One note row. The content exists here one time. */
export interface Note {
	readonly id: Ulid;
	readonly scope: ScopeKey;

	/** The slot: the rank of the note in the `(ts, id)` order of its scope. */
	readonly pos: number;
	readonly state: NoteState;
	readonly cleared: boolean;
	readonly kind: NoteKind;
	readonly body: string;
	readonly longform: string | null;
	readonly refs: readonly string[];
	readonly superseded_by: Ulid | null;

	/** The content date. It never changes. */
	readonly ts: string;
	readonly created_at: string;
	readonly modified_at: string;
	readonly review_at: string | null;
	readonly reviewed_at: string | null;
	readonly session: string;
	readonly turn: string;
	readonly preset: string;
	readonly v: string;
	readonly v_content: string;
	readonly v_review: string | null;
}

/** One node row. A cache entry that covers a slot range. */
export interface Node {
	readonly scope: ScopeKey;
	readonly level: number;
	readonly start: number;
	readonly summary: string;
	readonly ts_from: string;
	readonly ts_to: string;
	readonly built_v: string;

	/** The validity key of the left half. Null means that half holds no live note. */
	readonly a_key: string | null;
	readonly b_key: string | null;
}

/** One proposal row. A pending change that waits for a human. */
export interface Proposal {
	readonly id: Ulid;
	readonly scope: ScopeKey;
	readonly op: string;
	readonly target: Ulid | null;
	readonly payload: string;
	readonly created_at: string;
	readonly expires_at: string;
	readonly status: ProposalStatus;
}

/** The revision value of a read: the clock text of the read transaction. */
export type StoreRev = string;

/** One hit of the index. */
export interface IndexHit {
	readonly addr: string;
	readonly scope: ScopeKey;
	readonly pos: number;
	readonly id: Ulid;
	readonly ts: string;
	readonly kind: NoteKind;
	readonly body: string;
	readonly longformChars: number;
	readonly review_at: string | null;
}

/** The answer of one publication: the count of changed rows, or the reason of a refusal. */
export type WriteResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly reason: string };
