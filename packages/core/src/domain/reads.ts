/**
 * #region moduleContract
 * @modulecontract
 * @purpose Answer each memory read from the store rows, without a log scan.
 * @scope
 *  - The open of one note and of one range, the due review list, and the scope list.
 *  - NOT: the address grammar, the index storage, the locks, the tool schemas, and the find filters.
 * @invariants
 *  - Reads use the supplied rows through store/reads.ts and store/view.ts, with no log scan and
 *    no wait for a compaction.
 * @keywords open, longform, range, review, due, scopes, reads, store
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { liveCounts, scopeNotes } from "../store/reads.js";
import type { Store } from "../store/store.js";
import type { Note } from "../store/types.js";
import {
	loadView,
	nodeAt,
	nodeValid,
	notesInRange,
	textOfRange,
	type View,
} from "../store/view.js";
import type { IsoTime, NoteKind, ScopeKey } from "../types/primitives.js";
import { renderAddress } from "./address-form.js";
import { dayOf } from "./day.js";
import { cutAtWord, LINE_LIMIT, noteText } from "./tree.js";

const debug = debuglog("memlens:reads");

/** A read source: the rows of one store. */
export type ReadSource = Store;

/** The fields of one note that an open reads. */
export type OpenSubject = Pick<
	Note,
	| "id"
	| "pos"
	| "ts"
	| "body"
	| "longform"
	| "review_at"
	| "modified_at"
	| "refs"
>;

/** The character count of the head of a longform. */
export const LONGFORM_HEAD = 2048;

/** The character count of a complete longform answer. */
export const LONGFORM_ALL = 16_384;

/** The longform mode of an open. */
export type LongformMode = "none" | "head" | "all";

/** One open note with the visible part of its document. */
export interface OpenEntry {
	readonly kind: "entry";
	readonly addr: string;
	readonly pos: number;
	readonly id: string;
	readonly ts: string;
	readonly scope: ScopeKey;
	readonly body: string;
	readonly longform?: string;
	readonly longformChars: number;
	readonly longformOffset: number;
	readonly longformTruncated: boolean;
	readonly review_at: string | null;
	readonly modified_at: string;
	readonly refs: readonly string[];
}

/** One child line of an open range. */
export interface OpenLine {
	readonly addr: string;
	readonly ts_from: string;
	readonly ts_to: string;
	readonly text: string;
	readonly built: boolean;
	readonly chars: number;
}

/** The children of an open range. */
export interface OpenChildren {
	readonly kind: "children";
	readonly children: readonly OpenLine[];
}

// #region FUNC_openNote
/**
 * @purpose Give one note with the visible part of its document.
 * @invariants The mode head gives 2048 characters at most, and all gives 16384.
 * The offset cuts the document from its start. A negative offset reads from zero.
 * The answer reports the next offset and the rest flag.
 * The mode none omits the document text and keeps the full length.
 */
export function openNote(
	scope: ScopeKey,
	record: OpenSubject,
	mode: LongformMode = "head",
	offset = 0,
): OpenEntry {
	const document = record.longform ?? "";
	const start = Math.max(0, offset);
	const cap = mode === "all" ? LONGFORM_ALL : LONGFORM_HEAD;
	const slice = mode === "none" ? "" : document.slice(start, start + cap);
	const next = mode === "none" ? 0 : start + slice.length;
	debug("Note opened", {
		event: "open",
		pos: record.pos,
		mode,
		chars: document.length,
	});
	return {
		kind: "entry",
		addr: renderAddress(scope, record.pos, null),
		pos: record.pos,
		id: record.id,
		ts: record.ts,
		scope,
		body: record.body,
		...(mode === "none" ? {} : { longform: slice }),
		longformChars: document.length,
		longformOffset: next,
		longformTruncated: next < document.length,
		review_at: record.review_at,
		modified_at: record.modified_at,
		refs: record.refs,
	};
}
// #endregion FUNC_openNote

// #region FUNC_openRange
/**
 * @purpose Give the non-empty child lines of one range of positions.
 * @invariants An aligned range splits into its two halves. Each non-empty half gives one line.
 * A record half gives its body. A clean node half gives its summary. Another half gives a temporary
 * line with the text of its two children.
 * A range that matches no node geometry gives one line with the text of its live notes, or no line
 * when it holds none.
 */
export function openRange(
	scope: ScopeKey,
	view: View,
	start: number,
	end: number,
): OpenChildren {
	const span = end - start + 1;
	const level = Math.max(1, Math.ceil(Math.log2(span)));
	if (span !== 2 ** level || start % 2 ** level !== 0)
		return unalignedChildren(scope, view, start, end);
	const children = halfChildren(scope, view, start, level);
	debug("Range opened", {
		event: "open_range",
		start,
		end,
		lines: children.length,
	});
	return { kind: "children", children };
}
// #endregion FUNC_openRange

// #region FUNC_unalignedChildren
/** @purpose Give one line for a range that matches no node geometry. */
function unalignedChildren(
	scope: ScopeKey,
	view: View,
	start: number,
	end: number,
): OpenChildren {
	const notes = notesInRange(view, start, end + 1);
	debug("Range opened", {
		event: "open_range",
		start,
		end,
		lines: notes.length === 0 ? 0 : 1,
	});
	return {
		kind: "children",
		children:
			notes.length === 0
				? []
				: [
						line(
							scope,
							period(notes),
							start,
							null,
							notesText(notes, LINE_LIMIT),
						),
					],
	};
}
// #endregion FUNC_unalignedChildren

/** Give the text of a list of live notes, as one range line shows it. */
function notesText(notes: readonly Note[], limit: number): string {
	return cutAtWord(
		notes.map((note) => noteText(note.body, note.longform, limit)).join("; "),
		limit,
	);
}

// #region FUNC_halfChildren
/** @purpose Give one line for each non-empty half of an aligned range. */
function halfChildren(
	scope: ScopeKey,
	view: View,
	start: number,
	level: number,
): readonly OpenLine[] {
	const children: OpenLine[] = [];
	for (const half of [
		{ start, level: level - 1 },
		{ start: start + 2 ** (level - 1), level: level - 1 },
	]) {
		const notes = notesInRange(view, half.start, half.start + 2 ** half.level);
		const note = notes[0];
		if (note === undefined) continue;
		children.push(
			half.level === 0
				? recordLine(scope, note)
				: nodeLine(scope, view, notes, half),
		);
	}
	return children;
}
// #endregion FUNC_halfChildren

// #region FUNC_recordLine
/** @purpose Render one live note as a record line. */
function recordLine(scope: ScopeKey, note: Note): OpenLine {
	return {
		addr: renderAddress(scope, note.pos, null),
		ts_from: note.ts,
		ts_to: note.ts,
		text: note.body,
		built: true,
		chars: note.body.length,
	};
}
// #endregion FUNC_recordLine

// #region FUNC_nodeLine
/** @purpose Render one half as its clean node, or as a temporary line with the text of its children. */
function nodeLine(
	scope: ScopeKey,
	view: View,
	notes: readonly Note[],
	half: { readonly start: number; readonly level: number },
): OpenLine {
	const node = nodeAt(view, half.level, half.start);
	if (node === undefined || !nodeValid(view, node))
		return line(
			scope,
			period(notes),
			half.start,
			half,
			textOfRange(view, half),
		);
	return {
		addr: renderAddress(scope, node.start, node.start + 2 ** node.level - 1),
		ts_from: node.ts_from,
		ts_to: node.ts_to,
		text: node.summary,
		built: true,
		chars: node.summary.length,
	};
}
// #endregion FUNC_nodeLine

/** One due record of a review. */
export interface DueRecord {
	readonly addr: string;
	readonly scope: ScopeKey;
	readonly pos: number;
	readonly ts: string;
	readonly kind: NoteKind;
	readonly body: string;
	readonly review_at: string | null;
}

// #region FUNC_dueRecords
/**
 * @purpose List the due records of the supplied scopes, so a review answers without a log scan.
 * @invariants A record is due when its review time is now or earlier. A null scope list takes each scope
 * of the source, in scope order.
 * A record with no review value is never due. A null kind keeps each kind.
 * Order by the review value, then the scope, then the position.
 */
export function dueRecords(
	source: ReadSource | View,
	scopes: readonly ScopeKey[] | null,
	now: IsoTime,
	kind: NoteKind | null = null,
): readonly DueRecord[] {
	const due = reviewList(
		source,
		scopes,
		(row) => row.review_at !== null && row.review_at <= now,
		kind,
	);
	debug("Review listed", { event: "due", count: due.length, kind });
	return due;
}
// #endregion FUNC_dueRecords

/** One scope line of the scope list. */
export interface ScopeLine {
	readonly key: ScopeKey;
	readonly notes: number;
	readonly lastSeen: string;
}

// #region FUNC_scopeLines
/**
 * @purpose List the visible scopes with a live count and the date of the latest live write.
 * @invariants Keep the supplied scope order. A null scope list takes each live scope in key order.
 * lastSeen is the UTC date of the latest modified_at of a live note.
 */
export function scopeLines(
	source: ReadSource,
	scopes: readonly ScopeKey[] | null,
): readonly ScopeLine[] {
	const counts = liveCounts(source);
	const visible = scopes ?? [...counts.keys()];
	const lines = visible.flatMap((scope) => {
		const notes = scopeNotes(source, scope).filter(
			(row) => row.state === "live",
		);
		if (notes.length === 0) return [];
		const latest = latestOf(notes.map((row) => row.modified_at));
		return [
			{
				key: scope,
				notes: counts.get(scope) ?? notes.length,
				lastSeen: dayOf(latest),
			},
		];
	});
	debug("Scopes listed", { event: "scopes", count: lines.length });
	return lines;
}
// #endregion FUNC_scopeLines

function latestOf(values: readonly string[]): string {
	return [...values].sort().at(-1) ?? "";
}

function period(notes: readonly { readonly ts: string }[]): {
	from: string;
	to: string;
} {
	const first = notes[0];
	const last = notes[notes.length - 1];
	return { from: first?.ts ?? "", to: last?.ts ?? "" };
}

/** Give one line without a summary, with its dates and an optional text. */
function line(
	scope: ScopeKey,
	dates: { from: string; to: string },
	pos: number,
	half: { readonly start: number; readonly level: number } | null,
	text = "",
): OpenLine {
	return {
		addr: half
			? renderAddress(scope, half.start, half.start + 2 ** half.level - 1)
			: renderAddress(scope, pos, null),
		ts_from: dates.from,
		ts_to: dates.to,
		text,
		built: false,
		chars: text.length,
	};
}

// #region FUNC_reviewList
/** @purpose Collect the live notes of the scopes that pass the kind test and the review test. */
function reviewList(
	source: ReadSource | View,
	scopes: readonly ScopeKey[] | null,
	keep: (row: Note) => boolean,
	kind: NoteKind | null,
): DueRecord[] {
	const visible =
		scopes ??
		("notes" in source ? [source.scope] : [...liveCounts(source).keys()]);
	const list: DueRecord[] = [];
	for (const scope of visible) {
		const rows =
			"notes" in source
				? source.scope === scope
					? source.notes
					: []
				: scopeNotes(source, scope);
		for (const row of rows)
			if (
				row.state === "live" &&
				(kind === null || row.kind === kind) &&
				keep(row)
			)
				list.push({
					addr: renderAddress(scope, row.pos, null),
					scope,
					pos: row.pos,
					ts: row.ts,
					kind: row.kind,
					body: row.body,
					review_at: row.review_at,
				});
	}
	list.sort(
		(a, b) =>
			(a.review_at ?? "").localeCompare(b.review_at ?? "") ||
			a.scope.localeCompare(b.scope) ||
			a.pos - b.pos,
	);
	return list;
}
// #endregion FUNC_reviewList

// #region FUNC_loadRangeView
/**
 * @purpose Read the rows of one scope for an open of a range.
 * @invariants The view holds each note row and each node row of the scope.
 */
export function loadRangeView(store: Store, scope: ScopeKey): View {
	return loadView(store.handle(), scope);
}
// #endregion FUNC_loadRangeView
