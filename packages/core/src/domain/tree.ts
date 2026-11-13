/**
 * #region moduleContract
 * @purpose Provide pure range and text helpers for store views.
 * @scope Fold positions, calculate ranges, and limit text.
 * #endregion moduleContract
 */
import type { Lines, Pos, Range } from "../types/tree.js";

/** The greatest character count of one line of the view. */
export const LINE_LIMIT = 640;
const contains = (range: Range, pos: Pos) =>
	pos >= range.start && pos < range.start + 2 ** range.level;
// #region FUNC_cutAtWord

/**
 * @purpose Keep one text within a character limit and end it at a word boundary.
 * @invariants A text at or below the limit stays unchanged. A longer text cuts at its last space
 * before the limit, or at the limit when it holds no space.
 */
export function cutAtWord(text: string, limit: number): string {
	if (text.length <= limit) return text;
	const cut = text.slice(0, limit);
	const space = cut.lastIndexOf(" ");
	return space > 0 ? cut.slice(0, space) : cut;
}

// #endregion FUNC_cutAtWord

// #region FUNC_topRangeOf

/**
 * @purpose Keep the root extent tied to all assigned positions, without a tree.
 * @invariants Positive total gives start 0 and level max(1, ceil(log2(total))). Zero total gives null.
 * Total includes hidden and deleted positions. The root has no fixed depth limit.
 */
export function topRangeOf(total: Pos): Range | null {
	return total > 0
		? { start: 0, level: Math.max(1, Math.ceil(Math.log2(total))) }
		: null;
}

// #endregion FUNC_topRangeOf

function priority(total: Pos, a: Range, b: Range): number {
	return (
		due(total, { start: b.start, level: b.level - 1 }) -
			due(total, { start: a.start, level: a.level - 1 }) ||
		a.level - b.level ||
		a.start - b.start
	);
}

type MergePick = {
	index: number;
	range: Range;
	jump: number;
	reduction: number;
};

/** The index of the first live position at or above one slot. */
function lowerBound(positions: readonly Pos[], pos: Pos): number {
	let start = 0;
	let end = positions.length;
	while (start < end) {
		const middle = Math.floor((start + end) / 2);
		if ((positions[middle] ?? Infinity) < pos) start = middle + 1;
		else end = middle;
	}
	return start;
}

/** The index above the last live position at or below one slot. */
function upperBound(positions: readonly Pos[], pos: Pos): number {
	let start = 0;
	let end = positions.length;
	while (start < end) {
		const middle = Math.floor((start + end) / 2);
		if ((positions[middle] ?? Infinity) <= pos) start = middle + 1;
		else end = middle;
	}
	return start;
}

// #region FUNC_liveCount

/**
 * @purpose Count the live leaves of one range from the sorted positions.
 * @invariants The count is the slice of the positions inside the range.
 */
function liveCount(positions: readonly Pos[], range: Range): number {
	return (
		upperBound(positions, range.start + 2 ** range.level - 1) -
		lowerBound(positions, range.start)
	);
}

// #endregion FUNC_liveCount

// #region FUNC_sparseBlocks

/**
 * @purpose Tile empty gaps without allocating every assigned position.
 * @invariants Blocks tile [0, total) in position order with no gap or overlap.
 * Every block start is a multiple of 2^level. Empty gaps need no dense prefix.
 */
function sparseBlocks(positions: readonly Pos[], total: Pos): Range[] {
	const blocks: Range[] = [];
	let cursor = 0;
	const empty = (end: number) => {
		while (cursor < end) {
			let level = Math.floor(Math.log2(end - cursor));
			while (cursor % 2 ** level !== 0) level -= 1;
			blocks.push({ start: cursor, level });
			cursor += 2 ** level;
		}
	};
	for (const pos of positions) {
		empty(pos);
		blocks.push({ start: pos, level: 0 });
		cursor = pos + 1;
	}
	empty(total);
	return blocks;
}

// #endregion FUNC_sparseBlocks

// #region FUNC_selectMerge

/**
 * @purpose Select the best sibling pair while preserving the greatest live leaf.
 * @invariants A pair has adjacent blocks of equal level and a start divisible by the parent width.
 * No pair covers the greatest live position. Node readiness does not restrict a merge.
 * Minimize the sum of max(0, parentLevel - 1 - neighbourLevel) over existing outer neighbours.
 * Resolve ties with the order from candidates.
 */
function selectMerge(
	positions: readonly Pos[],
	blocks: readonly Range[],
	highest: Pos,
	total: Pos,
): MergePick | null {
	let best: MergePick | null = null;
	for (let index = 0; index + 1 < blocks.length; index += 1) {
		const left = blocks[index];
		const right = blocks[index + 1];
		if (!left || !right || left.level !== right.level) continue;
		const range = { start: left.start, level: left.level + 1 };
		if (
			right.start !== left.start + 2 ** left.level ||
			left.start % 2 ** range.level !== 0 ||
			contains(range, highest)
		)
			continue;
		const jump = [blocks[index - 1], blocks[index + 2]].reduce(
			(sum, neighbour) =>
				sum + (neighbour ? Math.max(0, range.level - 1 - neighbour.level) : 0),
			0,
		);
		const reduction =
			Number(liveCount(positions, left) > 0) +
			Number(liveCount(positions, right) > 0) -
			Number(liveCount(positions, range) > 0);
		if (
			!best ||
			jump < best.jump ||
			(jump === best.jump && priority(total, range, best.range) < 0)
		) {
			best = { index, range, jump, reduction };
		}
	}
	return best;
}

// #endregion FUNC_selectMerge

// #region FUNC_foldPositions

/**
 * @purpose Fold selected pairs until the rendered count fits, then evict excess oldest lines.
 * @scope A pure frontier over one sorted list of live positions and the assigned extent.
 * @requires The supplied positions are sorted and distinct.
 * @invariants Merge one pair only while the live line count exceeds the supplied line budget. Stop as soon as it fits.
 * Empty blocks never render or count against the budget. No range appears beside its descendants.
 * When no pair remains, evict the oldest excess lines. Preserve at least the greatest live leaf, even at budget zero.
 * @returns The frontier ranges from the oldest to the newest.
 */
export function foldPositions(
	positions: readonly Pos[],
	total: Pos,
	budget: Lines,
): readonly Range[] {
	if (!positions.length) return [];
	const highest = positions[positions.length - 1] ?? 0;
	const blocks = sparseBlocks(positions, total);
	let count = positions.length;
	while (count > budget) {
		const best = selectMerge(positions, blocks, highest, total);
		if (!best) break;
		blocks.splice(best.index, 2, best.range);
		count -= best.reduction;
	}
	const visible = blocks.filter((range) => liveCount(positions, range) > 0);
	return visible.slice(Math.max(0, visible.length - Math.max(1, budget)));
}

// #endregion FUNC_foldPositions

// #region FUNC_joinBody

/**
 * @purpose Join the two half texts of one range within the limit of a line.
 * @invariants A short pair joins whole. Above the limit, each half keeps a share of the room in
 * proportion to its own length, and a half below its share keeps its whole text.
 * A half at the limit stands for a longer text, so the other half keeps its whole text.
 */
export function joinBody(first: string, rest: string, limit: number): string {
	if (!first) return rest.slice(0, limit);
	if (!rest) return first.slice(0, limit);
	const room = Math.max(0, limit - 2);
	if (first.length + rest.length <= room) return `${first}; ${rest}`;
	const capped = (text: string) => text.length >= limit;
	if (capped(first) !== capped(rest)) {
		const [long, short] = capped(first) ? [first, rest] : [rest, first];
		const cut = cutAtWord(long, Math.max(0, room - short.length));
		return capped(first) ? `${cut}; ${short}` : `${short}; ${cut}`;
	}
	const share = Math.floor(
		(room * first.length) / (first.length + rest.length),
	);
	return `${cutAtWord(first, share)}; ${cutAtWord(rest, room - share)}`;
}

// #endregion FUNC_joinBody

// #region FUNC_due

/**
 * @purpose Rank a pair by its age relative to the assigned extent.
 * @invariants Due is (total - (start + 2^(level+1) - 1)) / 2^level, where level is the child level.
 * Total counts assigned positions, so an import that changes total also changes due.
 */
export function due(total: Pos, range: Range): number {
	return (
		(total - (range.start + 2 ** (range.level + 1) - 1)) / 2 ** range.level
	);
}

// #endregion FUNC_due
