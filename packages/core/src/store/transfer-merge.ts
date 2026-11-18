/**
 * #region moduleContract
 * @modulecontract
 * @purpose Join one incoming note with the local row through the five merge channels, so no update is lost.
 * @scope The lifecycle, content, review, and supersede channels; the version clock text.
 *  NOT: the transfer text and the store write.
 * @dependencies USES API: node:sqlite
 * @keywords transfer, merge, channel, clock, version, content, review, tombstone
 * #endregion moduleContract
 */

import type { DatabaseSync } from "node:sqlite";
import { parseVersion } from "./clock.js";
import type { LocalRow, Row } from "./transfer-format.js";
import type { NoteState } from "./types.js";

const STATE_RANK: Record<NoteState, number> = {
	live: 0,
	hidden: 1,
	deleted: 2,
};

/** The result of one merge of a local row and an incoming row. */
export interface Decision {
	merged: Row;
	changed: boolean;
	contentLost: boolean;
	contentKept: boolean;
	reviewLost: boolean;
	reviewKept: boolean;
}

// #region FUNC_mergeRow
/**
 * @purpose Join the five channels of one present note with its incoming copy.
 * @invariants Lifecycle takes the greater rank, and cleared latches to true.
 * @invariants The content group follows the greater v_content and skips a deleted or cleared row.
 * @invariants The review group follows the greater v_review. The first supersede link stays.
 * @invariants Each later version field takes the text maximum. The earlier created_at stays.
 * @invariants The later modified_at stays, because a lifecycle write also stamps it.
 * @returns The merged row, the change flag, and the two channel outcomes.
 */
export function mergeRow(local: LocalRow, incoming: Row): Decision {
	const merged: Row = { ...local };
	merged.state =
		STATE_RANK[incoming.state] > STATE_RANK[local.state]
			? incoming.state
			: local.state;
	merged.cleared = local.cleared || incoming.cleared;
	merged.v = maxText(local.v, incoming.v);
	merged.v_content = maxText(local.v_content, incoming.v_content);
	merged.v_review = maxReview(local.v_review, incoming.v_review);
	merged.created_at = minText(local.created_at, incoming.created_at);
	merged.modified_at = maxText(local.modified_at, incoming.modified_at);
	merged.superseded_by = local.superseded_by ?? incoming.superseded_by;
	const content = mergeContent(merged, local, incoming);
	const review = mergeReview(merged, local, incoming);
	if (merged.cleared) {
		merged.state = "deleted";
		merged.body = "";
		merged.longform = null;
	}
	return {
		merged,
		changed: rowDiffers(local, merged),
		contentLost: content.lost,
		contentKept: content.kept,
		reviewLost: review.lost,
		reviewKept: review.kept,
	};
}
// #endregion FUNC_mergeRow

// #region FUNC_mergeContent
/** @purpose Apply the content channel of one merge, and report which side won. */
function mergeContent(
	merged: Row,
	local: LocalRow,
	incoming: Row,
): { readonly lost: boolean; readonly kept: boolean } {
	if (merged.state === "deleted" || merged.cleared)
		return { lost: false, kept: false };
	if (incoming.v_content > local.v_content) {
		const lost = contentDiffers(local, incoming);
		copyContent(merged, incoming);
		return { lost, kept: false };
	}
	if (local.v_content > incoming.v_content && contentDiffers(local, incoming))
		return { lost: false, kept: true };
	return { lost: false, kept: false };
}
// #endregion FUNC_mergeContent

// #region FUNC_mergeReview
/** @purpose Apply the review channel of one merge, and report which side won. */
function mergeReview(
	merged: Row,
	local: LocalRow,
	incoming: Row,
): { readonly lost: boolean; readonly kept: boolean } {
	const won =
		incoming.v_review !== null &&
		(local.v_review === null || incoming.v_review > local.v_review);
	if (won) {
		const lost = local.v_review !== null && reviewDiffers(local, incoming);
		merged.review_at = incoming.review_at;
		merged.reviewed_at = incoming.reviewed_at;
		return { lost, kept: false };
	}
	if (
		incoming.v_review !== null &&
		local.v_review !== null &&
		local.v_review > incoming.v_review
	)
		return { lost: false, kept: reviewDiffers(local, incoming) };
	return { lost: false, kept: false };
}
// #endregion FUNC_mergeReview

// #region FUNC_foldClock
/**
 * @purpose Give the clock text that outranks the current value and each incoming version.
 * @invariants Only a version text that parses can raise the clock.
 * @returns The greatest valid text, or the empty text when none parses.
 */
export function foldClock(
	current: string,
	versions: readonly string[],
): string {
	let greatest = parseVersion(current) === null ? "" : current;
	for (const value of versions)
		if (parseVersion(value) !== null && value > greatest) greatest = value;
	return greatest;
}
// #endregion FUNC_foldClock

export function setClock(db: DatabaseSync, value: string): void {
	db.prepare(
		"INSERT INTO meta (key, value) VALUES ('clock', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
	).run(value);
}

function copyContent(target: Row, source: Row): void {
	target.scope = source.scope;
	target.ts = source.ts;
	target.kind = source.kind;
	target.body = source.body;
	target.longform = source.longform;
	target.refs = source.refs;
	target.session = source.session;
	target.turn = source.turn;
	target.preset = source.preset;
}

function contentDiffers(left: Row, right: Row): boolean {
	return (
		left.scope !== right.scope ||
		left.ts !== right.ts ||
		left.kind !== right.kind ||
		left.body !== right.body ||
		left.longform !== right.longform ||
		!sameRefs(left.refs, right.refs) ||
		left.session !== right.session ||
		left.turn !== right.turn ||
		left.preset !== right.preset
	);
}

function reviewDiffers(left: Row, right: Row): boolean {
	return (
		left.review_at !== right.review_at || left.reviewed_at !== right.reviewed_at
	);
}

// #region FUNC_rowDiffers
/** @purpose Report whether one merge changed a stored field of the note. */
function rowDiffers(left: Row, right: Row): boolean {
	return (
		left.scope !== right.scope ||
		left.ts !== right.ts ||
		left.state !== right.state ||
		left.cleared !== right.cleared ||
		left.kind !== right.kind ||
		left.body !== right.body ||
		left.longform !== right.longform ||
		!sameRefs(left.refs, right.refs) ||
		left.superseded_by !== right.superseded_by ||
		left.session !== right.session ||
		left.turn !== right.turn ||
		left.preset !== right.preset ||
		left.review_at !== right.review_at ||
		left.reviewed_at !== right.reviewed_at ||
		left.created_at !== right.created_at ||
		left.modified_at !== right.modified_at ||
		left.v !== right.v ||
		left.v_content !== right.v_content ||
		left.v_review !== right.v_review
	);
}
// #endregion FUNC_rowDiffers

function sameRefs(left: readonly string[], right: readonly string[]): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

function maxText(left: string, right: string): string {
	return left > right ? left : right;
}

function minText(left: string, right: string): string {
	return left < right ? left : right;
}

function maxReview(left: string | null, right: string | null): string | null {
	if (left === null) return right;
	if (right === null) return left;
	return left > right ? left : right;
}
