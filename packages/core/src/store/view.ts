/**
 * #region moduleContract
 * @modulecontract
 * @purpose Assemble the rows of one scope into the frontier lines, so a read renders without a projection.
 * @scope The note rows and the node rows of one scope, the validity test, the candidate ranges, the join text,
 * and the slice lines. NOT: model calls, node publication, and the store lock.
 * @invariants A read of the view uses the one handle of the caller and opens no long transaction.
 * @dependencies USES API: node:sqlite
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
	lowerBound,
	noteText,
	topRangeOf,
} from "../domain/tree.js";
import type { ScopeKey } from "../types/primitives.js";
import type { Lines, Pos, Range, SliceLine } from "../types/tree.js";
import { NOTE_COLUMNS, nodeFromRow, noteFromRow } from "./rows.js";
import type { Node, Note } from "./types.js";

const debug = debuglog("memlens:view");

/** The rows of one scope that the frontier renders. */
export interface View {
	readonly scope: ScopeKey;

	/** Each note row of the scope, in slot order, in any state. */
	readonly notes: readonly Note[];

	/** Each node row of the scope, in level then start order. */
	readonly nodes: readonly Node[];
}

/** The positions and maps that one render reads. */
interface Index {
	readonly notes: ReadonlyMap<Pos, Note>;
	readonly nodes: ReadonlyMap<string, Node>;
	readonly live: readonly Note[];
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

/** Each index of one view, so a read builds it once for its halves and its lines. */
const indexes = new WeakMap<View, Index>();

// #region FUNC_indexOf
/** @purpose Index one view for a render, so each lookup costs a map read or a binary search. */
export function indexOf(view: View): Index {
	const cached = indexes.get(view);
	if (cached !== undefined) return cached;
	const index = buildIndexOf(view);
	indexes.set(view, index);
	return index;
}
// #endregion FUNC_indexOf

function buildIndexOf(view: View): Index {
	const notes = new Map<Pos, Note>();
	const live: Note[] = [];
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

function liveInIndex(index: Index, from: Pos, to: Pos): boolean {
	const first = lowerBound(index.slots, from);
	return first < index.slots.length && (index.slots[first] ?? Infinity) < to;
}

function liveNotesOf(index: Index, range: Range): readonly Note[] {
	const first = lowerBound(index.slots, range.start);
	const last = lowerBound(index.slots, range.start + 2 ** range.level);
	return index.live.slice(first, last);
}

function leafKey(index: Index, pos: Pos): string | null {
	const note = index.notes.get(pos);
	return note === undefined ? null : `${note.v_content}|${note.state}`;
}

// #region FUNC_halfValidInIndex
/** @purpose Check one half of a node against its rows and its stored key. */
function halfValidInIndex(
	index: Index,
	halfLevel: number,
	halfStart: number,
	key: string | null,
): boolean {
	const width = 2 ** halfLevel;
	if (halfLevel === 0) {
		return key === null
			? !liveInIndex(index, halfStart, halfStart + 1)
			: leafKey(index, halfStart) === key;
	}
	if (key === null) return !liveInIndex(index, halfStart, halfStart + width);
	const child = index.nodes.get(nodeKey(halfLevel, halfStart));
	return child !== undefined && child.built_v === key;
}
// #endregion FUNC_halfValidInIndex

function validOf(index: Index, node: Node): boolean {
	const halfLevel = node.level - 1;
	const width = 2 ** halfLevel;
	return (
		halfValidInIndex(index, halfLevel, node.start, node.a_key) &&
		halfValidInIndex(index, halfLevel, node.start + width, node.b_key)
	);
}

// #region FUNC_nodeValid
/**
 * @purpose Prove one node row against the rows of one view.
 * @invariants Each non-null half matches its current key. Each null half holds no live note.
 * @returns True when the node may render its stored summary.
 */
export function nodeValid(view: View, node: Node): boolean {
	return validOf(indexOf(view), node);
}
// #endregion FUNC_nodeValid

// #region FUNC_nodeRowsOf
/** @purpose Give each indexed node row with its validity against the same scope rows. */
export function nodeRowsOf(index: Index): {
	readonly scope: ScopeKey;
	readonly node: Node;
	readonly clean: boolean;
}[] {
	return [...index.nodes.values()].map((node) => ({
		scope: node.scope,
		node,
		clean: validOf(index, node),
	}));
}
// #endregion FUNC_nodeRowsOf

// #region FUNC_candidatesOf
/**
 * @purpose List covered ranges that lack a valid node, so compaction has work.
 * @invariants Each range covers a live slot. The caller sets the result order.
 */
export function candidatesOf(index: Index): Range[] {
	const top = Math.max(1, Math.ceil(Math.log2(index.total)));
	const result: Range[] = [];
	for (let level = 1; level <= top; level++) {
		const width = 2 ** level;
		let previous = -1;
		for (const pos of index.slots) {
			const start = Math.floor(pos / width) * width;
			if (start === previous) continue;
			previous = start;
			const node = index.nodes.get(nodeKey(level, start));
			if (node === undefined || !validOf(index, node))
				result.push({ level, start });
		}
	}
	debug("Candidates listed", {
		slots: index.slots.length,
		count: result.length,
	});
	return result;
}
// #endregion FUNC_candidatesOf

// #region FUNC_nodeAt
/** @purpose Give the node row of one range, or undefined when the store holds none. */
export function nodeAt(
	view: View,
	level: number,
	start: number,
): Node | undefined {
	return indexOf(view).nodes.get(nodeKey(level, start));
}
// #endregion FUNC_nodeAt

// #region FUNC_notesInRange
/**
 * @purpose Give the live notes of one half-open slot range, so an open of a range reads rows only.
 * @invariants The result is in slot order. Hidden and deleted rows give no line.
 */
export function notesInRange(view: View, from: Pos, to: Pos): readonly Note[] {
	const index = indexOf(view);
	return index.live.slice(
		lowerBound(index.slots, from),
		lowerBound(index.slots, to),
	);
}
// #endregion FUNC_notesInRange

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
		return noteText(note.body, note.longform, limit);
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

// #region FUNC_textOfRange
/** @purpose Give the text of one range, as the slice renders it. */
export function textOfRange(
	view: View,
	range: Range,
	limit = LINE_LIMIT,
): string {
	return cutAtWord(rangeText(indexOf(view), range, limit), limit);
}
// #endregion FUNC_textOfRange

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
