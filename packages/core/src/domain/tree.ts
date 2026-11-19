/**
 * #region moduleContract
 * @modulecontract
 * @purpose Provide pure range and text helpers for store views.
 * @scope Search the sorted positions, fold positions, calculate ranges, and limit text.
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

type FoldBlock = {
	range: Range;
	live: boolean;
	previous: FoldBlock | null;
	next: FoldBlock | null;
	pick: MergePick | null;
};

type MergePick = {
	left: FoldBlock;
	right: FoldBlock;
	range: Range;
	jump: number;
	due: number;
};

// #region CLASS_MergeQueue
/**
 * @purpose Select the next pair without a full frontier scan after each merge.
 * @invariants The heap orders pairs by neighbour cost, then the existing candidate priority.
 * A block owns its current pick. A replaced pick stays in the heap until the next pop discards it.
 */
class MergeQueue {
	private readonly heap: MergePick[] = [];

	private compare(a: MergePick, b: MergePick): number {
		return (
			a.jump - b.jump ||
			b.due - a.due ||
			a.range.level - b.range.level ||
			a.range.start - b.range.start
		);
	}

	push(pick: MergePick): void {
		let index = this.heap.length;
		this.heap.push(pick);
		while (index > 0) {
			const parent = Math.floor((index - 1) / 2);
			const above = this.heap[parent];
			if (!above || this.compare(above, pick) <= 0) break;
			this.heap[index] = above;
			index = parent;
		}
		this.heap[index] = pick;
	}

	pop(): MergePick | null {
		while (this.heap.length) {
			const first = this.heap[0];
			const last = this.heap.pop();
			if (!first || !last) return null;
			if (this.heap.length) {
				let index = 0;
				while (index * 2 + 1 < this.heap.length) {
					let child = index * 2 + 1;
					const left = this.heap[child];
					const right = this.heap[child + 1];
					if (left && right && this.compare(right, left) < 0) child++;
					const below = this.heap[child];
					if (!below || this.compare(last, below) <= 0) break;
					this.heap[index] = below;
					index = child;
				}
				this.heap[index] = last;
			}
			if (first.left.pick === first) return first;
		}
		return null;
	}
}
// #endregion CLASS_MergeQueue

// #region FUNC_lowerBound
/** @purpose Give the index of the first live position at or above one slot, so a caller finds a range edge. */
export function lowerBound(positions: readonly Pos[], pos: Pos): number {
	let start = 0;
	let end = positions.length;
	while (start < end) {
		const middle = Math.floor((start + end) / 2);
		if ((positions[middle] ?? Infinity) < pos) start = middle + 1;
		else end = middle;
	}
	return start;
}
// #endregion FUNC_lowerBound

// #region FUNC_sparseBlocks
/**
 * @purpose Tile empty gaps without allocating every assigned position.
 * @invariants Blocks tile [0, total) in position order with no gap or overlap.
 * Every block start is a multiple of 2^level. Each live position gives a leaf. Empty gaps need no dense prefix.
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

// #region FUNC_queueMerge
/**
 * @purpose Refresh one sibling pair after a merge changes a block or an outer neighbour.
 * @invariants A pair has adjacent blocks of equal level and a start divisible by the parent width.
 * No pair covers the greatest live position. Node readiness does not restrict a merge.
 * The cost is the sum of max(0, parentLevel - 1 - neighbourLevel) over existing outer neighbours.
 */
function queueMerge(
	queue: MergeQueue,
	left: FoldBlock | null,
	highest: Pos,
	total: Pos,
): void {
	if (!left) return;
	left.pick = null;
	const right = left.next;
	if (!right || left.range.level !== right.range.level) return;
	const range = { start: left.range.start, level: left.range.level + 1 };
	if (
		right.range.start !== left.range.start + 2 ** left.range.level ||
		left.range.start % 2 ** range.level !== 0 ||
		contains(range, highest)
	)
		return;
	const cost = (block: FoldBlock | null) =>
		block ? Math.max(0, range.level - 1 - block.range.level) : 0;
	const pick = {
		left,
		right,
		range,
		jump: cost(left.previous) + cost(right.next),
		due: due(total, { start: range.start, level: range.level - 1 }),
	};
	left.pick = pick;
	queue.push(pick);
}
// #endregion FUNC_queueMerge

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
	if (positions.length <= budget)
		return positions.map((start) => ({ start, level: 0 }));
	const highest = positions[positions.length - 1] ?? 0;
	let liveIndex = 0;
	const blocks: FoldBlock[] = sparseBlocks(positions, total).map((range) => {
		const live = range.start === positions[liveIndex];
		if (live) liveIndex++;
		return { range, live, previous: null, next: null, pick: null };
	});
	for (const [index, block] of blocks.entries()) {
		block.previous = blocks[index - 1] ?? null;
		block.next = blocks[index + 1] ?? null;
	}
	const queue = new MergeQueue();
	for (const block of blocks) queueMerge(queue, block, highest, total);
	let count = positions.length;
	while (count > budget) {
		const best = queue.pop();
		if (!best) break;
		const { left, right } = best;
		count -= Number(left.live && right.live);
		left.range = best.range;
		left.live ||= right.live;
		left.next = right.next;
		if (left.next) left.next.previous = left;
		right.pick = null;
		// Only these pairs can have a different child or outer neighbour.
		queueMerge(queue, left.previous?.previous ?? null, highest, total);
		queueMerge(queue, left.previous, highest, total);
		queueMerge(queue, left, highest, total);
		queueMerge(queue, left.next, highest, total);
	}
	const visible: Range[] = [];
	for (let block = blocks[0] ?? null; block; block = block.next) {
		if (block.live) visible.push(block.range);
	}
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
