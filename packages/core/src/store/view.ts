/**
 * #region moduleContract
 * @purpose Assemble the rows of one scope into the frontier lines, so a read renders without a projection.
 * @scope The note rows and the node rows of one scope, the validity test against those rows, the join text,
 * and the slice lines. NOT: compaction, the model call, the write path, and the store lock.
 * @invariants The view holds each note row of the scope in slot order, in any state, and each node row by level and start.
 * @invariants A node renders only when each non-null half matches its row and each null half holds no live note.
 * @invariants A range without a valid node holds the text of its two children, joined whole when the pair fits the line limit.
 * @invariants A read of the view uses the one handle of the caller and opens no long transaction.
 * @dependencies node:sqlite, store/types.ts for the row shapes, domain/tree.ts for the fold and the line limit.
 * @usecases Slice: console => loads the view of one scope => gets the frontier lines
 * @keywords view, frontier, slice, node, note, validity, join, temporary, slot
 * #endregion moduleContract
 */

import type { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import {
	cutAtWord,
	foldPositions,
	joinBody,
	LINE_LIMIT,
	topRangeOf,
} from "../domain/tree.js";
import type { NoteKind, ScopeKey, Ulid } from "../types/events.js";
import type { Lines, Pos, Range, SliceLine } from "../types/tree.js";
import type { Node, Note, NoteState } from "./types.js";

const debug = debuglog("memlens:view");

/** One note row of a view. The line assembly reads the content, the date, and the validity key. */
export type ViewNote = Note;

/** One node row of a view. A node is a cache entry over a slot range. */
export type ViewNode = Node;

/** The rows of one scope that the frontier renders. */
export interface View {
	readonly scope: ScopeKey;
	/** Each note row of the scope, in slot order, in any state. */
	readonly notes: readonly ViewNote[];
	/** Each node row of the scope, in level then start order. */
	readonly nodes: readonly ViewNode[];
}

/** The columns of one note row, in the order of the note shape. */
const NOTE_COLUMNS =
	"id, scope, pos, state, cleared, kind, body, longform, refs, superseded_by, ts, created_at, modified_at, review_at, reviewed_at, session, turn, preset, v, v_content, v_review";

/** The positions and maps that one render reads. */
interface Index {
	readonly notes: ReadonlyMap<Pos, ViewNote>;
	readonly nodes: ReadonlyMap<string, ViewNode>;
	readonly live: readonly ViewNote[];
	readonly slots: readonly Pos[];
	readonly total: Pos;
}

const nodeKey = (level: number, start: number): string => `${level}:${start}`;

// #region FUNC_loadView
/**
 * @purpose Read each note row and each node row of one scope, as the input of the frontier.
 * @invariants The notes run from the first slot to the last, in any state.
 * The nodes run by level, then start. The read uses one statement for each table.
 * @returns The rows of the scope, or empty lists when the store holds no row.
 */
export function loadView(db: DatabaseSync, scope: ScopeKey): View {
	const notes = db
		.prepare(`SELECT ${NOTE_COLUMNS} FROM notes WHERE scope = ? ORDER BY pos`)
		.all(scope)
		.map(noteFromRow);
	const nodes = db
		.prepare(
			"SELECT scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key FROM nodes WHERE scope = ? ORDER BY level, start",
		)
		.all(scope)
		.map(nodeFromRow);
	debug("View loaded", {
		event: "load",
		scope,
		notes: notes.length,
		nodes: nodes.length,
	});
	return { scope, notes, nodes };
}
// #endregion FUNC_loadView

// #region FUNC_totalOf
/**
 * @purpose Give the assigned extent of one scope: one above the greatest slot in any state.
 * @invariants An empty scope gives zero. Hidden and deleted rows still count.
 */
export function totalOf(view: View): Pos {
	const last = view.notes[view.notes.length - 1];
	return last === undefined ? 0 : last.pos + 1;
}
// #endregion FUNC_totalOf

/** @purpose Index one view for a render, so each lookup costs a map read or a binary search. */
function indexOf(view: View): Index {
	const notes = new Map<Pos, ViewNote>();
	const live: ViewNote[] = [];
	for (const note of view.notes) {
		notes.set(note.pos, note);
		if (note.state === "live") live.push(note);
	}
	return {
		notes,
		nodes: new Map(
			view.nodes.map((node) => [nodeKey(node.level, node.start), node]),
		),
		live,
		slots: live.map((note) => note.pos),
		total: totalOf(view),
	};
}

/** @purpose Find the first live slot at or above one position. */
function lowerBound(slots: readonly Pos[], pos: Pos): number {
	let start = 0;
	let end = slots.length;
	while (start < end) {
		const middle = Math.floor((start + end) / 2);
		if ((slots[middle] ?? Infinity) < pos) start = middle + 1;
		else end = middle;
	}
	return start;
}

/** @purpose Report whether a live note occupies any slot of one half-open range. */
function liveIn(index: Index, from: Pos, to: Pos): boolean {
	const first = lowerBound(index.slots, from);
	return first < index.slots.length && (index.slots[first] ?? Infinity) < to;
}

/** @purpose Give the live notes of one range in slot order. */
function liveNotesOf(index: Index, range: Range): readonly ViewNote[] {
	const first = lowerBound(index.slots, range.start);
	const last = lowerBound(index.slots, range.start + 2 ** range.level);
	return index.live.slice(first, last);
}

/** @purpose Give the validity key of one leaf slot: the version and the state of the row. */
function leafKey(index: Index, pos: Pos): string | null {
	const note = index.notes.get(pos);
	return note === undefined ? null : `${note.v_content}|${note.state}`;
}

/** @purpose Check one half of a node against its rows and its stored key. */
function halfValid(
	index: Index,
	halfLevel: number,
	halfStart: number,
	key: string | null,
): boolean {
	const width = 2 ** halfLevel;
	if (halfLevel === 0) {
		return key === null
			? !liveIn(index, halfStart, halfStart + 1)
			: leafKey(index, halfStart) === key;
	}
	if (key === null) return !liveIn(index, halfStart, halfStart + width);
	const child = index.nodes.get(nodeKey(halfLevel, halfStart));
	return child !== undefined && child.built_v === key;
}

/** @purpose Prove that one node row summarizes the current halves of its range. */
function validOf(index: Index, node: ViewNode): boolean {
	const halfLevel = node.level - 1;
	const width = 2 ** halfLevel;
	return (
		halfValid(index, halfLevel, node.start, node.a_key) &&
		halfValid(index, halfLevel, node.start + width, node.b_key)
	);
}

// #region FUNC_nodeValid
/**
 * @purpose Prove one node row against the rows of one view.
 * @invariants Each non-null half matches its current key. Each null half holds no live note.
 * @returns True when the node may render its stored summary.
 */
export function nodeValid(view: View, node: ViewNode): boolean {
	return validOf(indexOf(view), node);
}
// #endregion FUNC_nodeValid

// #region FUNC_nodeAt
/** @purpose Give the node row of one range, or undefined when the store holds none. */
export function nodeAt(
	view: View,
	level: number,
	start: number,
): ViewNode | undefined {
	return view.nodes.find(
		(node) => node.level === level && node.start === start,
	);
}
// #endregion FUNC_nodeAt

// #region FUNC_notesInRange
/**
 * @purpose Give the live notes of one half-open slot range, so an open of a range reads rows only.
 * @invariants The result is in slot order. Hidden and deleted rows give no line.
 */
export function notesInRange(
	view: View,
	from: Pos,
	to: Pos,
): readonly ViewNote[] {
	const index = indexOf(view);
	return index.live.slice(
		lowerBound(index.slots, from),
		lowerBound(index.slots, to),
	);
}
// #endregion FUNC_notesInRange

/** @purpose Split one range into its two halves. */
function halves(range: Range): readonly [Range, Range] {
	const width = 2 ** (range.level - 1);
	return [
		{ start: range.start, level: range.level - 1 },
		{ start: range.start + width, level: range.level - 1 },
	];
}

// #region FUNC_rangeText
/**
 * @purpose Assemble the text of one range from the rows, without a model call.
 * @invariants A live note gives its body and its longform. A valid node gives its summary.
 * Another range joins the two half texts within the limit. A hidden or deleted note gives no text.
 * @returns The text, at most the limit in characters.
 */
function rangeText(index: Index, range: Range, limit: number): string {
	if (limit <= 0) return "";
	if (range.level === 0) {
		const note = index.notes.get(range.start);
		if (note === undefined || note.state !== "live") return "";
		const text = note.longform ? `${note.body}\n${note.longform}` : note.body;
		return text.slice(0, limit);
	}
	const node = index.nodes.get(nodeKey(range.level, range.start));
	if (node !== undefined && validOf(index, node))
		return node.summary.slice(0, limit);
	const [left, right] = halves(range);
	return joinBody(
		rangeText(index, left, limit),
		rangeText(index, right, limit),
		limit,
	);
}
// #endregion FUNC_rangeText

// #region FUNC_joinText
/**
 * @purpose Join the two child texts of one range and report whether the whole pair fits.
 * @invariants A pair that fits the limit joins whole, and the caller may publish it as a join node.
 * A pair above the limit cuts each half to a share of the room. An empty half gives the other whole.
 */
export function joinText(
	first: string,
	rest: string,
	limit = LINE_LIMIT,
): { readonly text: string; readonly fits: boolean } {
	if (!first) return { text: rest.slice(0, limit), fits: rest.length <= limit };
	if (!rest)
		return { text: first.slice(0, limit), fits: first.length <= limit };
	const whole = `${first}; ${rest}`;
	return whole.length <= limit
		? { text: whole, fits: true }
		: { text: joinBody(first, rest, limit), fits: false };
}
// #endregion FUNC_joinText

/** @purpose Give the dates of the first and last live note in one range. */
function periodOf(
	index: Index,
	range: Range,
): { readonly from: string; readonly to: string } {
	const notes = liveNotesOf(index, range);
	const first = notes[0];
	const last = notes[notes.length - 1];
	return { from: first?.ts ?? "", to: last?.ts ?? "" };
}

// #region FUNC_lineOfRange
/**
 * @purpose Render one frontier range as one line of the slice.
 * @invariants A live note of level zero gives a record line. A valid node gives its summary and its dates.
 * Another range gives a temporary line with the range dates and the assembled text cut at the limit.
 */
function lineOfRange(index: Index, range: Range): SliceLine {
	if (range.level === 0) {
		const note = index.notes.get(range.start);
		if (note !== undefined && note.state === "live")
			return {
				kind: "record",
				pos: range.start,
				from: note.ts,
				to: note.ts,
				body: note.body,
			};
	}
	const node = index.nodes.get(nodeKey(range.level, range.start));
	const period = periodOf(index, range);
	if (node !== undefined && validOf(index, node))
		return {
			kind: "summary",
			range,
			...period,
			summary: node.summary,
		};
	return {
		kind: "temporary",
		range,
		...period,
		text: cutAtWord(rangeText(index, range, LINE_LIMIT), LINE_LIMIT),
	};
}
// #endregion FUNC_lineOfRange

// #region FUNC_sliceOf
/**
 * @purpose Render the frontier of one view: a budgeted mixed-level set of ranges, the oldest first.
 * @invariants The fold keeps the greatest live slot. Each range renders by the node, the join, or the cut text.
 * A range of the frontier holds at least one live note. An empty view gives no line.
 * @returns The slice lines, from the oldest range to the newest, at most the budget in count.
 */
export function sliceOf(view: View, budget: Lines): readonly SliceLine[] {
	const index = indexOf(view);
	const lines = foldPositions(index.slots, index.total, budget).map((range) =>
		lineOfRange(index, range),
	);
	debug("View sliced", {
		event: "slice",
		scope: view.scope,
		budget,
		lines: lines.length,
	});
	return lines;
}
// #endregion FUNC_sliceOf

// #region FUNC_topLineOf
/**
 * @purpose Render the top line of one scope, for the directions block.
 * @invariants The top range covers each assigned slot. A scope with no live note gives no line.
 * A valid top node gives its summary. Another top range gives its assembled text.
 * @returns The line, or null when the scope shows no live note.
 */
export function topLineOf(view: View): SliceLine | null {
	const index = indexOf(view);
	if (!index.live.length) return null;
	const range = topRangeOf(index.total);
	return range === null ? null : lineOfRange(index, range);
}
// #endregion FUNC_topLineOf

// #region FUNC_textOfLine
/**
 * @purpose Give the visible text of one slice line, or an empty text.
 * @invariants A record gives its body, a summary gives its summary, and a temporary line gives its text.
 */
export function textOfLine(line: SliceLine): string {
	if (line.kind === "record") return line.body;
	return line.kind === "summary" ? line.summary : line.text;
}
// #endregion FUNC_textOfLine

/** @purpose Read one nullable text column. */
function nullable(value: unknown): string | null {
	return value === null || value === undefined ? null : String(value);
}

/** @purpose Read the JSON refs value of one row, so a damaged value never fails a read. */
function parseRefs(text: unknown): readonly string[] {
	if (typeof text !== "string" || text === "") return [];
	try {
		const value: unknown = JSON.parse(text);
		if (!Array.isArray(value)) return [];
		return value.filter((item): item is string => typeof item === "string");
	} catch {
		return [];
	}
}

// #region FUNC_noteFromRow
/**
 * @purpose Build one view note in one place, so each load gives the same note shape.
 * @invariants A cleared value of 0 gives false. A null column stays null. The refs field is JSON.
 */
function noteFromRow(row: Record<string, unknown>): ViewNote {
	return {
		id: String(row.id) as Ulid,
		scope: String(row.scope) as ScopeKey,
		pos: Number(row.pos),
		state: String(row.state) as NoteState,
		cleared: Number(row.cleared) !== 0,
		kind: String(row.kind) as NoteKind,
		body: String(row.body),
		longform: nullable(row.longform),
		refs: parseRefs(row.refs),
		superseded_by: nullable(row.superseded_by) as Ulid | null,
		ts: String(row.ts),
		created_at: String(row.created_at),
		modified_at: String(row.modified_at),
		review_at: nullable(row.review_at),
		reviewed_at: nullable(row.reviewed_at),
		session: String(row.session),
		turn: String(row.turn),
		preset: String(row.preset),
		v: String(row.v),
		v_content: String(row.v_content),
		v_review: nullable(row.v_review),
	};
}
// #endregion FUNC_noteFromRow

// #region FUNC_nodeFromRow
/**
 * @purpose Build one view node in one place, so the slice reads one node shape.
 * @invariants The two half keys stay null when the half holds no live note.
 */
function nodeFromRow(row: Record<string, unknown>): ViewNode {
	return {
		scope: String(row.scope) as ScopeKey,
		level: Number(row.level),
		start: Number(row.start),
		summary: String(row.summary),
		ts_from: String(row.ts_from),
		ts_to: String(row.ts_to),
		built_v: String(row.built_v),
		a_key: nullable(row.a_key),
		b_key: nullable(row.b_key),
	};
}
// #endregion FUNC_nodeFromRow
