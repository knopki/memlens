/**
 * Event types and sanitized forms.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Define the eight event operations and their sanitized forms, so the log has one type source.
 * @scope
 *  - The envelope of each event and the payload of each op.
 *  - The sanitized forms of note, amend, and node events.
 *  - NOT: the projection logic, the store, or the validation rules.
 * @invariants
 *  - An event has id, at, op, and scope.
 *  - A sanitized event carries redacted true and clears applicable content fields.
 *  - The log holds eight ops: note, amend, hide, redact, review, dismiss, node, invalidate.
 * @dependencies No imports from other modules.
 * @keywords events, log, note, amend, hide, redact, review, dismiss, node, invalidate, sanitized
 * #endregion moduleContract
 */

/** The identifier of an event. It is a ULID, and it sorts by time. */
export type Ulid = string;

/** The time in ISO 8601, in UTC with Z. The text sorts by time. */
export type IsoTime = string;

/** The date form of an older review value, as YYYY-MM-DD. */
export type IsoDate = string;

/** A scope key: two segments separated by a colon. */
export type ScopeKey = `${string}:${string}`;

/** The kind of a note. */
export type NoteKind = "decision" | "preference" | "fact" | "task" | "note";

/** The fields of each event. */
export interface EventBase {
	readonly id: Ulid;
	/** The time of the log. The projection orders the events by (at, id). */
	readonly at: IsoTime;
	/**
	 * The resolved scope. For an amend, this is the destination scope. For another op, this is
	 * the current scope.
	 */
	readonly scope: ScopeKey;
	/** A raw event carries no redacted field. A sanitized event carries redacted: true. */
	readonly redacted?: never;
}

/**
 * A note: one curated fact.
 *
 * A write outside the profile carries proposed: true. The projection ignores a proposed event.
 */
export interface NoteEvent extends EventBase {
	readonly op: "note";
	readonly body: string;
	readonly kind: NoteKind;
	/** The time of the write of the note. */
	readonly ts: IsoTime;
	/** The next review time. The log keeps older values of the date form. */
	readonly review_at: IsoTime | null;
	/** True when the event is a proposal. The projection ignores it. */
	readonly proposed?: true;
	readonly session: string;
	readonly turn: string;
	readonly preset: string;
	readonly longform?: string;
	readonly refs?: readonly string[];
	/** The ids of the records that the note replaces. */
	readonly supersedes?: readonly Ulid[];
}

/** A change of the content, the longform, the scope, the kind, or the supersedes of a record. */
export interface AmendEvent extends EventBase {
	readonly op: "amend";
	readonly target: Ulid;
	readonly body?: string;
	readonly longform?: string;
	/** The new kind of the note. The time, the review date, and the content stay. */
	readonly kind?: NoteKind;
	/** The records that the note replaces. An amendment adds links and removes none. */
	readonly supersedes?: readonly Ulid[];
	/** True when the event is a proposal. The projection ignores it. */
	readonly proposed?: true;
}

/** The removal of a record from the view. The content stays. */
export interface HideEvent extends EventBase {
	readonly op: "hide";
	readonly target: Ulid;
	readonly reason: string;
	/** True when the event is a proposal. The projection ignores it. */
	readonly proposed?: true;
}

/** The erase of the content of a record. A redact is final. */
export interface RedactEvent extends EventBase {
	readonly op: "redact";
	readonly target: Ulid;
	readonly reason: string;
}

/** The record of a check by a human, and the time of the next check. */
export interface ReviewEvent extends EventBase {
	readonly op: "review";
	readonly target: Ulid;
	/** The next review time. The log keeps older values of the date form. */
	readonly review_at: IsoTime | null;
	/** True when the event is a proposal. The projection ignores it. */
	readonly proposed?: true;
}

/** The close of one proposed event. It changes no record. */
export interface DismissEvent extends EventBase {
	readonly op: "dismiss";
	/** The id of the proposed event that this event closes. */
	readonly target: Ulid;
	readonly reason: string;
}

/** One summary of a range, recorded as an event. */
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

/** A sanitized note event. The content is cleared, and the metadata stays. */
export type SanitizedNoteEvent = Omit<
	NoteEvent,
	"body" | "longform" | "redacted"
> & {
	readonly body: "";
	readonly longform: null;
	readonly redacted: true;
};

/** A sanitized amend event. Clear present content fields and preserve absent fields and metadata. */
export type SanitizedAmendEvent = Omit<
	AmendEvent,
	"body" | "longform" | "redacted"
> & {
	readonly body?: "";
	readonly longform?: null;
	readonly redacted: true;
};

/**
 * A sanitized node event. The summary is cleared, and the metadata stays.
 * The child ids stay. The node says nothing about the content of the child notes.
 */
export type SanitizedNodeEvent = Omit<
	NodeEvent,
	"summary" | "chars" | "redacted"
> & {
	readonly summary: "";
	readonly chars: 0;
	readonly redacted: true;
};

/** A sanitized content-bearing event. The content is cleared, and the metadata stays. */
export type SanitizedEvent =
	| SanitizedNoteEvent
	| SanitizedAmendEvent
	| SanitizedNodeEvent;

/** The line of the JSONL log: one raw event, or one sanitized content-bearing event. */
export type JsonlLine = Event | SanitizedEvent;
