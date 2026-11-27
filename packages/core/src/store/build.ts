/**
 * #region moduleContract
 * @modulecontract
 * @purpose Build summary cache rows from consistent child snapshots.
 * @scope Candidate ranges, build reads, child rows, build inputs, joins, and conditional publication.
 * @invariants A model call runs outside the store transaction.
 * #endregion moduleContract
 */

import type { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import { due } from "../domain/tree.js";
import type { ScopeKey } from "../types/primitives.js";
import type { BuildChild, BuildInput, Range } from "../types/tree.js";
import type { Store } from "./store.js";
import {
	candidatesOf,
	indexOf,
	joinText,
	loadView,
	nodeAt,
	nodeValid,
	notesInRange,
	type View,
} from "./view.js";

const debug = debuglog("memlens:build");

/** The child keys and text captured for one build. */
export type BuildRead = {
	readonly ok: true;
	readonly aKey: string | null;
	readonly bKey: string | null;
	readonly aText: string | null;
	readonly bText: string | null;

	/** The full longform of a leaf half. */
	readonly aPreview: string | null;
	readonly bPreview: string | null;

	/** The live date span of the left half. An empty half gives empty dates. */
	readonly aFrom: string;
	readonly aTo: string;

	/** The live date span of the right half. An empty half gives empty dates. */
	readonly bFrom: string;
	readonly bTo: string;

	readonly tsFrom: string;
	readonly tsTo: string;
	readonly fits: boolean;
};

type Half = {
	key: string | null;
	text: string | null;
	preview: string | null;
} | null;

// #region FUNC_half
/** @purpose Read one ready child or detect an unready child. */
function half(view: View, level: number, start: number): Half {
	const live = notesInRange(view, start, start + 2 ** level);
	if (!live.length) return { key: null, text: null, preview: null };
	if (level === 0) {
		const note = live[0];
		if (!note) return null;
		return {
			key: `${note.v_content}|${note.state}`,
			text: note.body,
			preview: note.longform ?? "",
		};
	}
	const node = nodeAt(view, level, start);
	return node && nodeValid(view, node)
		? { key: node.built_v, text: node.summary, preview: null }
		: null;
}
// #endregion FUNC_half

// #region FUNC_snapshot
/** @purpose Capture the current children and the live dates of the range and of each half. */
function snapshot(view: View, level: number, start: number): BuildRead | null {
	const live = notesInRange(view, start, start + 2 ** level);
	const first = live[0];
	const last = live[live.length - 1];
	if (!first || !last || level < 1) return null;
	const width = 2 ** (level - 1);
	const spanOf = (from: number): { from: string; to: string } => {
		const halfLive = live.filter((n) => n.pos >= from && n.pos < from + width);
		const halfFirst = halfLive[0];
		const halfLast = halfLive[halfLive.length - 1];
		return { from: halfFirst?.ts ?? "", to: halfLast?.ts ?? "" };
	};
	const a = half(view, level - 1, start);
	const b = half(view, level - 1, start + width);
	if (!a || !b) return null;
	const aSpan = spanOf(start);
	const bSpan = spanOf(start + width);
	return {
		ok: true,
		aKey: a.key,
		bKey: b.key,
		aText: a.text,
		bText: b.text,
		aPreview: a.preview,
		bPreview: b.preview,
		aFrom: aSpan.from,
		aTo: aSpan.to,
		bFrom: bSpan.from,
		bTo: bSpan.to,
		tsFrom: first.ts,
		tsTo: last.ts,
		fits: !a.preview && !b.preview && joinText(a.text ?? "", b.text ?? "").fits,
	};
}
// #endregion FUNC_snapshot

// #region FUNC_readBuild
/** @purpose Capture the ready children of one covered range in one read transaction. */
export function readBuild(
	store: Store,
	scope: ScopeKey,
	level: number,
	start: number,
): BuildRead | { readonly ok: false; readonly reason: "empty" } {
	const result = store.read((db) =>
		snapshot(loadView(db, scope), level, start),
	);
	debug("Build read", { scope, level, start, ready: result !== null });
	return result ?? { ok: false, reason: "empty" };
}
// #endregion FUNC_readBuild

// #region FUNC_insertNode
/** @purpose Write one node row with the keys and dates of one captured read. */
export function insertNode(
	db: DatabaseSync,
	scope: ScopeKey,
	level: number,
	start: number,
	summary: string,
	read: BuildRead,
	version: string,
	aKey: string | null,
	bKey: string | null,
): void {
	db.prepare(
		"INSERT OR REPLACE INTO nodes (scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
	).run(
		scope,
		level,
		start,
		summary,
		read.tsFrom,
		read.tsTo,
		version,
		aKey,
		bKey,
	);
}
// #endregion FUNC_insertNode

// #region FUNC_childOf
/**
 * @purpose Build one child of a read at one half start, so each host reads the same child row.
 * @invariants A half without text gives null. A record takes the first live date of its half. A
 * node takes the date span of its half, never the span of the whole range.
 */
export function childOf(
	read: BuildRead,
	range: Range,
	start: number,
): BuildChild | null {
	const left = start === range.start;
	const text = left ? read.aText : read.bText;
	const key = left ? read.aKey : read.bKey;
	if (text === null) return null;
	if (range.level === 1)
		return {
			kind: "record",
			id: key ?? "",
			pos: start,
			body: text,
			preview: (left ? read.aPreview : read.bPreview) ?? "",
			ts: left ? read.aFrom : read.bFrom,
		};
	return {
		kind: "node",
		id: key ?? "",
		range: { start, level: range.level - 1 },
		summary: text,
		ts_from: left ? read.aFrom : read.bFrom,
		ts_to: left ? read.aTo : read.bTo,
	};
}
// #endregion FUNC_childOf

// #region FUNC_inputOf
/** @purpose Join the two children of one read into the merge input of that range. */
function inputOf(read: BuildRead, range: Range): BuildInput {
	const width = 2 ** (range.level - 1);
	return {
		range,
		children: [
			childOf(read, range, range.start),
			childOf(read, range, range.start + width),
		],
	};
}
// #endregion FUNC_inputOf

// #region FUNC_publishNode
/** @purpose Publish a summary only when both captured child keys still match. */
export function publishNode(
	store: Store,
	scope: ScopeKey,
	level: number,
	start: number,
	summary: string,
	read: BuildRead,
):
	| { readonly ok: true; readonly version: string }
	| { readonly ok: false; readonly reason: "input_changed" } {
	const result = store.publish((tx) => {
		const current = snapshot(loadView(tx.db, scope), level, start);
		if (!current || current.aKey !== read.aKey || current.bKey !== read.bKey)
			return false;
		insertNode(
			tx.db,
			scope,
			level,
			start,
			summary,
			read,
			tx.version,
			current.aKey,
			current.bKey,
		);
		return true;
	});
	if (!result.value) {
		debug("Node rejected", { scope, level, start, reason: "input_changed" });
		return { ok: false, reason: "input_changed" };
	}
	debug("Node published", { scope, level, start, version: result.version });
	return { ok: true, version: result.version };
}
// #endregion FUNC_publishNode

// #region FUNC_publishJoin
/** @purpose Publish a whole child join without a model call. */
export function publishJoin(
	store: Store,
	scope: ScopeKey,
	level: number,
	start: number,
	read: BuildRead,
):
	| ReturnType<typeof publishNode>
	| { readonly ok: false; readonly reason: "no_fit" } {
	if (!read.fits) return { ok: false, reason: "no_fit" };
	return publishNode(
		store,
		scope,
		level,
		start,
		joinText(read.aText ?? "", read.bText ?? "").text,
		read,
	);
}
// #endregion FUNC_publishJoin

// #region FUNC_sortedCandidates
/** @purpose List the covered ranges without valid cache rows, older coverage first. */
function sortedCandidates(index: ReturnType<typeof indexOf>): readonly Range[] {
	return candidatesOf(index).sort(
		(a, b) =>
			due(index.total, { start: b.start, level: b.level - 1 }) -
				due(index.total, { start: a.start, level: a.level - 1 }) ||
			a.level - b.level ||
			a.start - b.start,
	);
}
// #endregion FUNC_sortedCandidates

// #region FUNC_candidates
/** @purpose List covered ranges without valid cache rows, with older coverage first. */
export function candidates(store: Store, scope: ScopeKey): readonly Range[] {
	return store.read((db) => {
		const result = sortedCandidates(indexOf(loadView(db, scope)));
		debug("Candidates listed", { scope, count: result.length });
		return result;
	});
}
// #endregion FUNC_candidates

/** One ready range of one round: its captured read and the merge input of that read. */
export interface RoundEntry {
	readonly range: Range;
	readonly read: BuildRead;
	readonly input: BuildInput;
}

// #region FUNC_captureRound
/** @purpose Capture each ready range of one view, in candidate order, with the input of each read. */
export function captureRound(view: View): RoundEntry[] {
	const entries: RoundEntry[] = [];
	for (const range of sortedCandidates(indexOf(view))) {
		const read = snapshot(view, range.level, range.start);
		if (!read) continue;
		entries.push({ range, read, input: inputOf(read, range) });
	}
	debug("Round captured", { scope: view.scope, found: entries.length });
	return entries;
}
// #endregion FUNC_captureRound

// #region FUNC_readRound
/** @purpose Capture each ready range of one scope from one view, with no write. */
export function readRound(
	store: Store,
	scope: ScopeKey,
): readonly RoundEntry[] {
	return store.read((db) => captureRound(loadView(db, scope)));
}
// #endregion FUNC_readRound

// #region FUNC_buildInput
/**
 * @purpose Read the current build input of one range, so no host builds an input of its own.
 * @invariants The input comes from one read transaction. Null means an empty half, and the caller
 *   must not publish that range.
 */
export function buildInput(
	store: Store,
	scope: ScopeKey,
	range: Range,
): RoundEntry | null {
	const read = readBuild(store, scope, range.level, range.start);
	if (!read.ok) return null;
	return { range, read, input: inputOf(read, range) };
}
// #endregion FUNC_buildInput
