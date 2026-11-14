/**
 * The tools of the agent.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give each tool one input type and one output type, so the agent schema and the parser
 * have one home.
 * @scope
 *  - The six tools of the agent surface and their answers.
 *  - NOT: the permissions, the errors, and the limits of a render. The requirements hold them.
 * @invariants
 *  - A tool takes the fields of its input type only.
 *  - An answer holds the fields of its output type only.
 * @keywords tools, memory_note, memory_find, memory_open, memory_forget, memory_review, memory_map
 * #endregion moduleContract
 */

import type { Days, NoteKind, ScopeKey } from "./config.js";

/**
 * The address of a record: `pos`, `pos-pos`, `scope#pos`, or `scope#pos-pos`.
 *
 * A leading `#` is a render form, and the tool strips one before the parse.
 */
export type Address = string;

/** A period of review, or no review. */
export type ReviewIn = `${number}d` | "never";

export interface MemoryNoteInput {
	/** The body. The limit is 512 characters, and the declared size is 384 characters. */
	body: string;
	longform?: string;
	/** The key, or no value for the active scope. */
	scope?: ScopeKey;
	kind?: NoteKind;
	/** The records that the new record replaces. A target is a `pos` or an `Address`. */
	supersedes?: (number | string)[];
	reviewIn?: ReviewIn;
}

/**
 * The answer of a write. A live record gives its address. A proposed write gives its proposal `id`.
 */
export type MemoryNoteOutput =
	| { addr: Address; id: string; state: "live"; review_at: string | null }
	| { id: string; proposed: true };

export interface MemoryFindInput {
	/** The words. Each word must match, and `-word` excludes. */
	query?: string;
	scopes?: ScopeKey[];
	since?: string;
	until?: string;
	kinds?: NoteKind[];
	due?: boolean;
	/** 10 by default, and 50 for each scope at most. */
	limit?: number;
}

export interface MemoryFindHit {
	addr: Address;
	scope: ScopeKey;
	pos: number;
	id: string;
	ts: string;
	kind: NoteKind;
	body: string;
	longformChars: number;
	review_at: string | null;
}

export interface MemoryFindOutput {
	hits: MemoryFindHit[];
}

export interface MemoryOpenInput {
	/** An `Address`, a `pos` of the active scope, or a range `a-b`. A leading `#` is allowed. */
	target: string | number;
	longform?: "none" | "head" | "all";
	offset?: number;
}

export interface MemoryOpenEntry {
	kind: "entry";
	addr: Address;
	pos: number;
	id: string;
	ts: string;
	scope: ScopeKey;
	body: string;
	longform?: string;
	longformChars: number;
	longformOffset: number;
	longformTruncated: boolean;
	review_at: string | null;
	refs: string[];
}

/** One child of a node: a note or a smaller node, as the slice renders it. */
export interface MemoryOpenLine {
	/**
	 * The address of the child: `scope#2107` for a note, or `scope#1024-2047` for a node. The tool
	 * accepts this value as a target, with the `#` or without it.
	 */
	addr: Address;
	ts_from: string;
	ts_to: string;
	/** The body of a note or the summary of a clean node. A temporary line gives no text. */
	text: string;
	/** False when the node of the line is not clean, and the line is temporary. */
	built: boolean;
	chars: number;
}

export interface MemoryOpenChildren {
	kind: "children";
	/** The non-empty children, at most two. An empty range gives no child line. */
	children: MemoryOpenLine[];
}

export type MemoryOpenOutput = MemoryOpenEntry | MemoryOpenChildren;

export interface MemoryForgetInput {
	/** A target is a `pos` of the scope or an `Address`. */
	targets: (number | string)[];
	scope?: ScopeKey;
	reason: string;
}

export interface MemoryForgetOutput {
	hidden: number;
	rebuildsQueued: number;
	topNodesQueued: number;
}

export interface MemoryReviewInput {
	scope?: ScopeKey;
	/** A target is an `Address`, or a `pos` with a `scope`. */
	reviewed?: (number | string)[];
	reviewIn?: ReviewIn;
}

export interface MemoryReviewDue {
	addr: Address;
	scope: ScopeKey;
	pos: number;
	ts: string;
	kind: NoteKind;
	body: string;
	review_at: string | null;
}

export type MemoryReviewOutput =
	| { due: MemoryReviewDue[] }
	| { reviewed: number; next: string };

export interface MemoryMapInput {
	/** A key, or no value for the list of the visible scopes. */
	scope?: ScopeKey;
}

/** One line of the scope list: the keys of one range, their idle time, and the summary. */
export interface MemoryDirectionLine {
	keys: ScopeKey[];
	ts_from: string;
	ts_to: string;
	/** The summary of the top node. A scope above the `directions` budget gives no text. */
	text: string;
}

export type MemoryMapOutput =
	| { kind: "scopes"; lines: MemoryDirectionLine[] }
	| { kind: "scope"; scope: ScopeKey; lines: MemoryOpenLine[] };

/** The review period of a kind when a write names no value. */
export type ReviewDefaults = Record<NoteKind, Days>;
