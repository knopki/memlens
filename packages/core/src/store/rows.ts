/**
 * #region moduleContract
 * @modulecontract
 * @purpose Build one row shape from one SQLite row, so each read of a note or a node agrees.
 * @scope The note row, the node row, the note columns, and the refs text.
 *  NOT: the queries, the validity keys, or the store.
 * @invariants A cleared value of 0 gives false. A missing column gives null. The refs field is JSON text.
 * @keywords row, note, node, map, refs, null
 * #endregion moduleContract
 */

import type { NoteKind, ScopeKey, Ulid } from "../types/primitives.js";
import type { Node, Note, NoteState } from "./types.js";

/** The columns of one note row, in the order of the note shape. */
export const NOTE_COLUMNS =
	"id, scope, pos, state, cleared, kind, body, longform, refs, superseded_by, ts, created_at, modified_at, review_at, reviewed_at, session, turn, preset, v, v_content, v_review";

// #region FUNC_noteFromRow
/**
 * @purpose Build one note in one place, so each read gives the same note shape.
 * @param row - One row of the notes table.
 * @returns The note with the refs as a list of strings.
 */
export function noteFromRow(row: Record<string, unknown>): Note {
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
 * @purpose Build one node in one place, so the slice reads one node shape.
 * @param row - One row of the nodes table.
 * @returns The node. The two half keys stay null when the half holds no live note.
 */
export function nodeFromRow(row: Record<string, unknown>): Node {
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

export function nullable(value: unknown): string | null {
	return value === null || value === undefined ? null : String(value);
}

// #region FUNC_parseRefs
/** @purpose Read the JSON refs value of one row, so a damaged value never fails a read. */
export function parseRefs(text: unknown): readonly string[] {
	if (typeof text !== "string" || text === "") return [];
	try {
		const value: unknown = JSON.parse(text);
		if (!Array.isArray(value)) return [];
		return value.filter((item): item is string => typeof item === "string");
	} catch {
		return [];
	}
}
// #endregion FUNC_parseRefs
