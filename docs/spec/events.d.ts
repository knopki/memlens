/**
 * The events of the log.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Hold the shape of each event in one type file, so the log, the export, and the import have
 * one source.
 * @scope
 *  - The envelope of an event and the payload of each of the eight ops.
 *  - NOT: the projection, the tool inputs, and the configuration.
 * @invariants
 *  - An event is immutable, and its `id` is a ULID.
 *  - `at` is the time of the log, and `ts` is the time of the write of a note.
 *  - The payload belongs to the op, and no op takes a field of another op.
 * @keywords event, log, op, note, amend, hide, redact, review, dismiss, node
 * #endregion moduleContract
 */

import type { NoteKind, ScopeKey } from "./config.js";

/** The identifier of an event. It is a ULID, and it sorts by time. */
export type Ulid = string;

/** The time in ISO 8601, in UTC with `Z`. The text sorts by time. */
export type IsoTime = string;

/** The date of a review, as `YYYY-MM-DD`. */
export type IsoDate = string;

/** The fields of each event. */
export interface EventBase {
	readonly id: Ulid;
	/** The time of the log. The projection orders the events by `(at, id)`. */
	readonly at: IsoTime;
	readonly scope: ScopeKey;
}

/**
 * A note: one curated fact.
 *
 * A write outside the profile carries `proposed: true`, and the projection ignores a proposed event.
 * A decision on a proposal carries `accepts`, the id of that proposal.
 */
export interface NoteEvent extends EventBase {
	readonly op: "note";
	readonly body: string;
	readonly kind: NoteKind;
	/** The time of the write of the note. */
	readonly ts: IsoTime;
	readonly review_at: IsoDate | null;
	readonly proposed: boolean;
	readonly session: string;
	readonly turn: string;
	readonly preset: string;
	readonly accepts?: Ulid;
	readonly longform?: string;
	readonly refs?: readonly string[];
	/** The ids of the records that the note replaces. */
	readonly supersedes?: readonly Ulid[];
}

/** A change of the content, the longform, or the scope of a record. */
export interface AmendEvent extends EventBase {
	readonly op: "amend";
	readonly target: Ulid;
	readonly body?: string;
	readonly longform?: string;
	readonly scope?: ScopeKey;
	readonly proposed?: boolean;
}

/** The removal of a record from the view. The content stays. */
export interface HideEvent extends EventBase {
	readonly op: "hide";
	readonly target: Ulid;
	readonly reason: string;
	readonly proposed?: boolean;
}

/** The erase of the content of a record. A `redact` is final. */
export interface RedactEvent extends EventBase {
	readonly op: "redact";
	readonly target: Ulid;
	readonly reason: string;
}

/** The record of a check by a human, and the date of the next check. */
export interface ReviewEvent extends EventBase {
	readonly op: "review";
	readonly target: Ulid;
	readonly review_at: IsoDate | null;
}

/** The close of a proposal. */
export interface DismissEvent extends EventBase {
	readonly op: "dismiss";
	readonly target: Ulid;
	/** The id of the proposal that the event closes. */
	readonly proposal: Ulid;
	readonly reason: string;
}

/** One summary of a range, recorded as an event. See [tree.d.ts](tree.d.ts). */
export interface NodeEvent extends EventBase {
	readonly op: "node";
	readonly level: number;
	readonly start: number;
	/** Null means that the left half has no live record. */
	readonly child_a: Ulid | null;
	/** Null means that the right half has no live record. */
	readonly child_b: Ulid | null;
	/** The revision of the two children at the build. */
	readonly input_rev: `${string}|${string}` | null;
	readonly summary: string;
	readonly chars: number;
	readonly truncated: boolean;
	readonly ts_from: IsoTime;
	readonly ts_to: IsoTime;
}

/** The node ids whose summaries must stay unusable. A later rebuild gets a new id. */
export interface InvalidateEvent extends EventBase {
	readonly op: "invalidate";
	readonly targets: readonly Ulid[];
}

/** The log holds these eight ops. */
export type Event =
	| NoteEvent
	| AmendEvent
	| HideEvent
	| RedactEvent
	| ReviewEvent
	| DismissEvent
	| NodeEvent
	| InvalidateEvent;

/** An event after a `redact` of its record: it keeps the `id` and loses the content. */
export interface SanitizedEvent extends EventBase {
	readonly redacted: true;
	readonly body?: "";
	readonly summary?: "";
	readonly longform?: null;
}

/** The line of the JSONL log: one event, or its sanitized form. */
export type JsonlLine = Event | SanitizedEvent;
