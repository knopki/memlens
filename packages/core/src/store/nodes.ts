/**
 * #region moduleContract
 * @modulecontract
 * @purpose Keep the summary tree consistent with the notes and prove the validity of one node.
 * @scope The covering delete of the write path, the range delete of a shift, and the three validity rules.
 * @invariants A node covers the slot range `[start, start + 2^level)` of one scope.
 * @invariants A write that changes a covered slot deletes the node in the same transaction, so the read keys guard against a missed path.
 * @dependencies USES API: node:sqlite
 * @keywords node, summary, cover, delete, validity, key, half
 * #endregion moduleContract
 */

import type { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import type { ScopeKey } from "../types/primitives.js";
import type { Node } from "./types.js";

const debug = debuglog("memlens:nodes");

/** The width that one level covers: level 1 covers two slots, each level doubles the range. */
export function widthOf(level: number): number {
	return 1 << level;
}

// #region FUNC_deleteCovering
/**
 * @purpose Delete each node of a scope that covers one slot, at every level.
 * @invariants The caller runs the statement inside the write transaction of the change.
 * @returns The count of deleted node rows.
 */
export function deleteCovering(
	db: DatabaseSync,
	scope: ScopeKey,
	pos: number,
): number {
	const result = db
		.prepare(
			"DELETE FROM nodes WHERE scope = ? AND start <= ? AND ? < start + (1 << level)",
		)
		.run(scope, pos, pos);
	debug("Nodes cover delete", {
		event: "cover_delete",
		slot: pos,
		deleted: result.changes,
	});
	return Number(result.changes);
}
// #endregion FUNC_deleteCovering

// #region FUNC_deleteRange
/**
 * @purpose Delete each node of a scope that intersects one slot range.
 * @invariants A tail shift calls this for the whole shifted range in the same transaction.
 * @returns The count of deleted node rows.
 */
export function deleteRange(
	db: DatabaseSync,
	scope: ScopeKey,
	from: number,
	to: number,
): number {
	const result = db
		.prepare(
			"DELETE FROM nodes WHERE scope = ? AND start < ? AND start + (1 << level) > ?",
		)
		.run(scope, to, from);
	debug("Nodes range delete", {
		event: "range_delete",
		from,
		to,
		deleted: result.changes,
	});
	return Number(result.changes);
}
// #endregion FUNC_deleteRange

// #region FUNC_leafKeyOf
/**
 * @purpose Read the validity key of one leaf slot: the version and the state of the occupant.
 * @invariants The key text is `v_content|state` of the slot occupant.
 * @returns The key text, or null when the slot holds no row.
 */
export function leafKeyOf(
	db: DatabaseSync,
	scope: ScopeKey,
	pos: number,
): string | null {
	const row = db
		.prepare("SELECT v_content, state FROM notes WHERE scope = ? AND pos = ?")
		.get(scope, pos);
	if (row === undefined) return null;
	return `${row.v_content}|${row.state}`;
}
// #endregion FUNC_leafKeyOf

// #region FUNC_nodeKeyOf
/**
 * @purpose Read the validity key of one child node row.
 * @invariants The key text is the `built_v` of the child row.
 * @returns The build version, or null when the child row is absent.
 */
function nodeKeyOf(
	db: DatabaseSync,
	scope: ScopeKey,
	level: number,
	start: number,
): string | null {
	const row = db
		.prepare(
			"SELECT built_v FROM nodes WHERE scope = ? AND level = ? AND start = ?",
		)
		.get(scope, level, start);
	return row === undefined ? null : String(row.built_v);
}
// #endregion FUNC_nodeKeyOf

// #region FUNC_validNode
/**
 * @purpose Prove that one node still summarizes the current halves of its range.
 * @invariants Each non-null half matches its current child key. Each null half holds no live note.
 * @returns True when the node may render.
 */
export function validNode(db: DatabaseSync, node: Node): boolean {
	const half = node.level - 1;
	const width = widthOf(half);
	return (
		halfValidInStore(db, node.scope, half, width, node.start, node.a_key) &&
		halfValidInStore(
			db,
			node.scope,
			half,
			width,
			node.start + width,
			node.b_key,
		)
	);
}
// #endregion FUNC_validNode

/** @purpose Check one half of a node against its child range and key. */
function halfValidInStore(
	db: DatabaseSync,
	scope: ScopeKey,
	halfLevel: number,
	halfWidth: number,
	halfStart: number,
	key: string | null,
): boolean {
	if (halfLevel === 0) {
		return key === null
			? !liveInStore(db, scope, halfStart, halfStart + 1)
			: leafKeyOf(db, scope, halfStart) === key;
	}
	if (key === null)
		return !liveInStore(db, scope, halfStart, halfStart + halfWidth);
	return nodeKeyOf(db, scope, halfLevel, halfStart) === key;
}

/** @purpose Report whether a live note occupies any slot of one range. */
function liveInStore(
	db: DatabaseSync,
	scope: ScopeKey,
	from: number,
	to: number,
): boolean {
	const row = db
		.prepare(
			"SELECT 1 FROM notes WHERE scope = ? AND state = 'live' AND pos >= ? AND pos < ? LIMIT 1",
		)
		.get(scope, from, to);
	return row !== undefined;
}
