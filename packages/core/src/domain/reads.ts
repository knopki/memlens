/**
 * #region moduleContract
 * @purpose Answer each memory read from the store rows or the projection, without a log scan.
 * @scope
 *  - Find filters, the open of one note and of one range, the due review list, and the scope list.
 *  - NOT: the address grammar, the index storage, the locks, and the tool schemas.
 * @invariants
 *  - A store source reads rows through store/reads.ts and store/view.ts. A projection source serves
 * the frontend packages until their read path moves to the store.
 *  - Find keeps at most 50 hits for each scope and at most 10 hits in total by default.
 *  - Since and until compare against the ts text, and a date-only bound covers that whole day.
 *  - The due filter and the due list take a record with a review time of now or earlier.
 *  - A due list without a scope takes each scope of the supplied list, in scope order.
 *  - A kind filter keeps the records of one kind. An upcoming count ignores the limit.
 *  - An open of one note gives the document of the record. The default mode is head.
 *  - Head gives 8192 characters at most, and all gives 16384.
 *  - The offset continues the document after the earlier answer, and reports the next offset.
 *  - An open of an aligned range gives the non-empty child lines. A clean child gives its text.
 *  - A dirty or missing child gives a temporary line with the period and no text.
 *  - A range that matches no node gives one line, and the line holds the first pos.
 *  - Every read uses the supplied projection and hits. No read scans events or waits for a compaction.
 * @dependencies
 *  USES API: domain/address.ts, domain/tree.ts, store/reads.ts, store/view.ts
 *  READS: Projection, IndexHit, Tree, Note, View
 * @keywords find, filter, open, longform, range, review, due, scopes, reads, store
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
	type View,
} from "../store/view.js";
import type { IsoDate, IsoTime, NoteKind, ScopeKey } from "../types/events.js";
import type { Projection } from "../types/projection.js";
import type { IndexHit } from "../types/store.js";
import type { Tree } from "../types/tree.js";
import { renderAddress } from "./address.js";
import { currentNode, isClean } from "./tree.js";

const debug = debuglog("memlens:reads");

/** A read source: the rows of one store, or the projection of a frontend package. */
export type ReadSource = Projection | Store;

/** @purpose Report whether one read source holds the row handle of the store. */
function isStore(source: ReadSource): source is Store {
	return "handle" in source;
}

/** @purpose Report whether one range source holds the assigned extent of a projection tree. */
function isTree(source: Tree | View): source is Tree {
	return "total" in source;
}

/** The fields of one note that an open reads. A store note and a projection record both fit. */
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

/** The filters of a find. Null or absent fields impose no limit. */
export interface FindFilter {
	readonly scopes?: readonly ScopeKey[] | null;
	readonly since?: string | null;
	readonly until?: string | null;
	readonly kinds?: readonly NoteKind[] | null;
	readonly due?: boolean;
	readonly limit?: number;
}

/** The default limit of a find. */
export const FIND_DEFAULT_LIMIT = 10;
/** The greatest hit count of a find for each scope. */
export const FIND_MAX_PER_SCOPE = 50;
/** The character count of the head of a longform. */
export const LONGFORM_HEAD = 8192;
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

// #region FUNC_filterHits
/**
 * @purpose Apply the find filters to complete hits, so the tools and the CLI share one answer.
 * @invariants Keep the hit order. Cap the hits at 50 for each scope, then apply the total limit.
 * A due hit has a review value of now or earlier. A negative limit gives no hit. The default limit is 10.
 */
export function filterHits(
	hits: readonly IndexHit[],
	filter: FindFilter,
	now: IsoTime,
): readonly IndexHit[] {
	const scopes = filter.scopes ? new Set(filter.scopes) : null;
	const kinds = filter.kinds ? new Set(filter.kinds) : null;
	const limit = Math.max(0, filter.limit ?? FIND_DEFAULT_LIMIT);
	const perScope = new Map<ScopeKey, number>();
	const result = hits.filter((hit) => {
		if (scopes !== null && !scopes.has(hit.scope)) return false;
		if (kinds !== null && !kinds.has(hit.kind)) return false;
		if (filter.since && hit.ts.slice(0, filter.since.length) < filter.since)
			return false;
		if (filter.until && hit.ts.slice(0, filter.until.length) > filter.until)
			return false;
		if (filter.due && (hit.review_at === null || hit.review_at > now))
			return false;
		const seen = perScope.get(hit.scope) ?? 0;
		if (seen >= FIND_MAX_PER_SCOPE) return false;
		perScope.set(hit.scope, seen + 1);
		return true;
	});
	debug("Find filtered", {
		event: "find",
		hits: hits.length,
		kept: result.length,
		limit,
	});
	return result.slice(0, limit);
}
// #endregion FUNC_filterHits

// #region FUNC_openNote
/**
 * @purpose Give one note with the visible part of its document.
 * @invariants The mode head gives 8192 characters at most, and all gives 16384.
 * The offset cuts the document from its start. The answer reports the next offset and the rest flag.
 * The mode none omits the document text and keeps the full length.
 */
export function openNote(
	scope: ScopeKey,
	record: OpenSubject,
	mode: LongformMode = "head",
	offset = 0,
): OpenEntry {
	const document = record.longform ?? "";
	const cap = mode === "all" ? LONGFORM_ALL : LONGFORM_HEAD;
	const slice = mode === "none" ? "" : document.slice(offset, offset + cap);
	const next = mode === "none" ? 0 : offset + slice.length;
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
 * A record half gives its body. A clean node half gives its summary. Another half gives a temporary line.
 * A range that matches no node geometry gives one line that holds the first pos.
 */
export function openRange(
	scope: ScopeKey,
	source: Tree | View,
	start: number,
	end: number,
): OpenChildren {
	if (!isTree(source)) return openViewRange(scope, source, start, end);
	const tree = source;
	const span = end - start + 1;
	const level = Math.max(1, Math.ceil(Math.log2(span)));
	const live = liveNotes(tree, start, end);
	if (span !== 2 ** level || start % 2 ** level !== 0) {
		debug("Range opened", { event: "open_range", start, end, lines: 1 });
		return {
			kind: "children",
			children: [line(scope, period(live), start, null)],
		};
	}
	const children: OpenLine[] = [];
	for (const half of [
		{ start, level: level - 1 },
		{ start: start + 2 ** (level - 1), level: level - 1 },
	]) {
		const notes = liveNotes(tree, half.start, half.start + 2 ** half.level - 1);
		if (!notes.length) continue;
		if (half.level === 0) {
			const record = notes[0];
			if (!record) continue;
			children.push({
				addr: renderAddress(scope, record.pos, null),
				ts_from: record.ts,
				ts_to: record.ts,
				text: record.body,
				built: true,
				chars: record.body.length,
			});
			continue;
		}
		const node = currentNode(tree, half);
		children.push(
			node && isClean(tree, node)
				? {
						addr: renderAddress(
							scope,
							node.range.start,
							node.range.start + 2 ** node.range.level - 1,
						),
						ts_from: node.ts_from,
						ts_to: node.ts_to,
						text: node.summary,
						built: true,
						chars: node.chars,
					}
				: line(scope, period(notes), half.start, half),
		);
	}
	debug("Range opened", {
		event: "open_range",
		start,
		end,
		lines: children.length,
	});
	return { kind: "children", children };
}
// #endregion FUNC_openRange

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
 * @invariants A record is due when its review time is now or earlier. A null scope list takes each scope.
 * A record with no review value is never due. A null kind keeps each kind.
 * Order by the review value, then the scope, then the position.
 */
export function dueRecords(
	source: ReadSource,
	scopes: readonly ScopeKey[] | null,
	now: IsoTime,
	kind: NoteKind | null = null,
): readonly DueRecord[] {
	if (isStore(source)) return dueFromStore(source, scopes, now, kind);
	const due = reviewList(source, scopes, (review) => review <= now, kind);
	debug("Review listed", { event: "due", count: due.length, kind });
	return due;
}
// #endregion FUNC_dueRecords

/** One page of the records that come due next, with the count of the whole list. */
export interface UpcomingPage {
	readonly records: readonly DueRecord[];
	readonly total: number;
}

// #region FUNC_upcomingRecords
/**
 * @purpose List the records that come due next, so the review screen stays useful before a due time.
 * @invariants A record is upcoming when its review time is after now. A null review value stays out.
 * The limit caps the records, and the total counts each record of the kind before the cap.
 * Order by the review value, then the scope, then the position.
 */
export function upcomingRecords(
	source: ReadSource,
	scopes: readonly ScopeKey[] | null,
	now: IsoTime,
	limit: number,
	kind: NoteKind | null = null,
): UpcomingPage {
	if (isStore(source))
		return upcomingFromStore(source, scopes, now, limit, kind);
	const next = reviewList(source, scopes, (review) => review > now, kind);
	debug("Review upcoming listed", {
		event: "upcoming",
		count: next.length,
		limit,
		kind,
	});
	return { records: next.slice(0, limit), total: next.length };
}
// #endregion FUNC_upcomingRecords

/** Collect the live records that pass the kind test and the review test, in review value order. */
function reviewList(
	projection: Projection,
	scopes: readonly ScopeKey[] | null,
	keep: (review_at: string) => boolean,
	kind: NoteKind | null,
): DueRecord[] {
	const visible = scopes === null ? projection.scopeOrder : scopes;
	const list: DueRecord[] = [];
	for (const scope of visible) {
		const records = projection.byScope.get(scope) ?? [];
		for (const record of records)
			if (
				record.state === "live" &&
				record.review_at !== null &&
				(kind === null || record.kind === kind) &&
				keep(record.review_at)
			)
				list.push({
					addr: renderAddress(scope, record.pos, null),
					scope,
					pos: record.pos,
					ts: record.ts,
					kind: record.kind,
					body: record.body,
					review_at: record.review_at,
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

/** One scope line of the scope list. */
export interface ScopeLine {
	readonly key: ScopeKey;
	readonly notes: number;
	readonly lastSeen: IsoDate;
}

// #region FUNC_scopeLines
/**
 * @purpose List the visible scopes with a live count and the date of the latest live write.
 * @invariants Keep the scope order of the projection. A null scope list takes each scope.
 * lastSeen is the UTC date of the latest recorded_at of a live record.
 */
export function scopeLines(
	source: ReadSource,
	scopes: readonly ScopeKey[] | null,
): readonly ScopeLine[] {
	if (isStore(source)) return scopeLinesFromStore(source, scopes);
	const projection = source;
	const visible = scopes === null ? projection.scopeOrder : scopes;
	const lines = visible.flatMap((scope) => {
		const live = (projection.byScope.get(scope) ?? []).filter(
			(record) => record.state === "live",
		);
		if (!live.length) return [];
		const latest = latestOf(live.map((record) => record.recorded_at));
		return [{ key: scope, notes: live.length, lastSeen: latest.slice(0, 10) }];
	});
	debug("Scopes listed", { event: "scopes", count: lines.length });
	return lines;
}
// #endregion FUNC_scopeLines

function liveNotes(
	tree: Tree,
	start: number,
	end: number,
): readonly (typeof tree.notes)[number][] {
	return tree.notes
		.filter(
			(note) => note.state === "live" && note.pos >= start && note.pos <= end,
		)
		.sort((a, b) => a.pos - b.pos);
}

/** @purpose Give the greatest text of a non-empty list, so a date compare stays one rule. */
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

function line(
	scope: ScopeKey,
	dates: { from: string; to: string },
	pos: number,
	half: { readonly start: number; readonly level: number } | null,
): OpenLine {
	return {
		addr: half
			? renderAddress(scope, half.start, half.start + 2 ** half.level - 1)
			: renderAddress(scope, pos, null),
		ts_from: dates.from,
		ts_to: dates.to,
		text: "",
		built: false,
		chars: 0,
	};
}

// #region FUNC_dueFromStore
/**
 * @purpose List the due notes of the supplied scopes from the rows of one store.
 * @invariants The read takes the live rows of the scope list, or of each scope when the list is null.
 * Order by the review value, then the scope, then the slot.
 */
function dueFromStore(
	store: Store,
	scopes: readonly ScopeKey[] | null,
	now: IsoTime,
	kind: NoteKind | null,
): readonly DueRecord[] {
	const due = storeReviewList(
		store,
		scopes,
		(row) => row.review_at !== null && row.review_at <= now,
		kind,
	);
	debug("Review listed", { event: "due", count: due.length, kind });
	return due;
}
// #endregion FUNC_dueFromStore

// #region FUNC_upcomingFromStore
/**
 * @purpose List the notes that come due next from the rows of one store.
 * @invariants A note is upcoming when its review value is after now. The total counts each row before the cap.
 */
function upcomingFromStore(
	store: Store,
	scopes: readonly ScopeKey[] | null,
	now: IsoTime,
	limit: number,
	kind: NoteKind | null,
): UpcomingPage {
	const next = storeReviewList(
		store,
		scopes,
		(row) => row.review_at !== null && row.review_at > now,
		kind,
	);
	debug("Review upcoming listed", {
		event: "upcoming",
		count: next.length,
		limit,
		kind,
	});
	return { records: next.slice(0, limit), total: next.length };
}
// #endregion FUNC_upcomingFromStore

/** @purpose Collect the live notes of the scopes that pass the kind test and the review test. */
function storeReviewList(
	store: Store,
	scopes: readonly ScopeKey[] | null,
	keep: (row: Note) => boolean,
	kind: NoteKind | null,
): DueRecord[] {
	const visible = scopes ?? [...liveCounts(store).keys()];
	const list: DueRecord[] = [];
	for (const scope of visible) {
		for (const row of scopeNotes(store, scope))
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

// #region FUNC_scopeLinesFromStore
/**
 * @purpose List the scopes with a live count and the date of the latest live write, from the rows.
 * @invariants The read takes the live counts of the store. A null scope list takes each live scope.
 * lastSeen is the UTC date of the latest modified_at of a live note.
 */
function scopeLinesFromStore(
	store: Store,
	scopes: readonly ScopeKey[] | null,
): readonly ScopeLine[] {
	const counts = liveCounts(store);
	const visible = scopes ?? [...counts.keys()];
	const lines = visible.flatMap((scope) => {
		const notes = scopeNotes(store, scope).filter(
			(row) => row.state === "live",
		);
		if (notes.length === 0) return [];
		const latest = latestOf(notes.map((row) => row.modified_at));
		return [
			{
				key: scope,
				notes: counts.get(scope) ?? notes.length,
				lastSeen: latest.slice(0, 10),
			},
		];
	});
	debug("Scopes listed", { event: "scopes", count: lines.length });
	return lines;
}
// #endregion FUNC_scopeLinesFromStore

// #region FUNC_openViewRange
/**
 * @purpose Give the non-empty child lines of one range from the rows of one view.
 * @invariants An aligned range splits into its two halves. Each non-empty half gives one line.
 * A live note half gives its body. A valid node half gives its summary. Another half gives a
 * temporary line with its dates and no text.
 * A range that matches no node geometry gives one line that holds the first pos.
 */
function openViewRange(
	scope: ScopeKey,
	view: View,
	start: number,
	end: number,
): OpenChildren {
	const span = end - start + 1;
	const level = Math.max(1, Math.ceil(Math.log2(span)));
	const children: OpenLine[] = [];
	if (span !== 2 ** level || start % 2 ** level !== 0) {
		debug("Range opened", { event: "open_range", start, end, lines: 1 });
		return {
			kind: "children",
			children: [
				line(scope, period(notesInRange(view, start, end + 1)), start, null),
			],
		};
	}
	for (const half of [
		{ start, level: level - 1 },
		{ start: start + 2 ** (level - 1), level: level - 1 },
	]) {
		const notes = notesInRange(view, half.start, half.start + 2 ** half.level);
		if (notes.length === 0) continue;
		if (half.level === 0) {
			const note = notes[0];
			if (note === undefined) continue;
			children.push({
				addr: renderAddress(scope, note.pos, null),
				ts_from: note.ts,
				ts_to: note.ts,
				text: note.body,
				built: true,
				chars: note.body.length,
			});
			continue;
		}
		const node = nodeAt(view, half.level, half.start);
		children.push(
			node !== undefined && nodeValid(view, node)
				? {
						addr: renderAddress(
							scope,
							node.start,
							node.start + 2 ** node.level - 1,
						),
						ts_from: node.ts_from,
						ts_to: node.ts_to,
						text: node.summary,
						built: true,
						chars: node.summary.length,
					}
				: line(scope, period(notes), half.start, half),
		);
	}
	debug("Range opened", {
		event: "open_range",
		start,
		end,
		lines: children.length,
	});
	return { kind: "children", children };
}
// #endregion FUNC_openViewRange

// #region FUNC_loadRangeView
/**
 * @purpose Read the rows of one scope for an open of a range.
 * @invariants The view holds each note row and each node row of the scope.
 */
export function loadRangeView(store: Store, scope: ScopeKey): View {
	return loadView(store.handle(), scope);
}
// #endregion FUNC_loadRangeView
