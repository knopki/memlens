/**
 * #region moduleContract
 * @purpose Build summary cache rows from consistent child snapshots.
 * @scope Candidate ranges, build reads, joins, and conditional publication.
 * @invariants A model call runs outside the store transaction.
 * @invariants Publication rejects a change to either child key.
 * @dependencies store/view.ts, store/store.ts, domain/tree.ts.
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { due } from "../domain/tree.js";
import type { ScopeKey } from "../types/events.js";
import type { Range } from "../types/tree.js";
import type { Store } from "./store.js";
import { joinText, loadView, nodeAt, nodeValid, type View } from "./view.js";

const debug = debuglog("memlens:build");

/** The child keys and text captured for one build. */
export type BuildRead = {
	readonly ok: true;
	readonly aKey: string | null;
	readonly bKey: string | null;
	readonly aText: string | null;
	readonly bText: string | null;
	/** The longform preview of a leaf half: the first 1024 characters. */
	readonly aPreview: string | null;
	readonly bPreview: string | null;
	readonly tsFrom: string;
	readonly tsTo: string;
	readonly fits: boolean;
};

type Half = {
	key: string | null;
	text: string | null;
	preview: string | null;
} | null;

/** @purpose Read one ready child or detect an unready child. */
function half(view: View, level: number, start: number): Half {
	const live = view.notes.filter(
		(n) => n.state === "live" && n.pos >= start && n.pos < start + 2 ** level,
	);
	if (!live.length) return { key: null, text: null, preview: null };
	if (level === 0) {
		const note = live[0];
		if (!note) return null;
		return {
			key: `${note.v_content}|${note.state}`,
			text: note.body,
			preview: (note.longform ?? "").slice(0, 1024),
		};
	}
	const node = nodeAt(view, level, start);
	return node && nodeValid(view, node)
		? { key: node.built_v, text: node.summary, preview: null }
		: null;
}

/** @purpose Capture the current children and the dates of their live leaves. */
function snapshot(view: View, level: number, start: number): BuildRead | null {
	const live = view.notes.filter(
		(n) => n.state === "live" && n.pos >= start && n.pos < start + 2 ** level,
	);
	const first = live[0];
	const last = live[live.length - 1];
	if (!first || !last || level < 1) return null;
	const width = 2 ** (level - 1);
	const a = half(view, level - 1, start);
	const b = half(view, level - 1, start + width);
	if (!a || !b) return null;
	return {
		ok: true,
		aKey: a.key,
		bKey: b.key,
		aText: a.text,
		bText: b.text,
		aPreview: a.preview,
		bPreview: b.preview,
		tsFrom: first.ts,
		tsTo: last.ts,
		fits: joinText(a.text ?? "", b.text ?? "").fits,
	};
}

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
		tx.db
			.prepare(
				"INSERT OR REPLACE INTO nodes (scope, level, start, summary, ts_from, ts_to, built_v, a_key, b_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				scope,
				level,
				start,
				summary,
				read.tsFrom,
				read.tsTo,
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

// #region FUNC_candidates

/** @purpose List covered ranges without valid cache rows, with older coverage first. */
export function candidates(store: Store, scope: ScopeKey): readonly Range[] {
	return store.read((db) => {
		const view = loadView(db, scope);
		const last = view.notes.at(-1);
		if (!last) return [];
		const top = Math.max(1, Math.ceil(Math.log2(last.pos + 1)));
		const ranges = new Map<string, Range>();
		for (const note of view.notes)
			if (note.state === "live")
				for (let level = 1; level <= top; level++) {
					const start = Math.floor(note.pos / 2 ** level) * 2 ** level;
					ranges.set(`${level}:${start}`, { level, start });
				}
		const result = [...ranges.values()]
			.filter((range) => {
				const node = nodeAt(view, range.level, range.start);
				return !node || !nodeValid(view, node);
			})
			.sort(
				(a, b) =>
					due(last.pos + 1, { start: b.start, level: b.level - 1 }) -
						due(last.pos + 1, { start: a.start, level: a.level - 1 }) ||
					a.level - b.level ||
					a.start - b.start,
			);
		debug("Candidates listed", { scope, count: result.length });
		return result;
	});
}

// #endregion FUNC_candidates
