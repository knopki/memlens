/**
 * #region moduleContract
 * @modulecontract
 * @purpose Check the pure range, fold, and text helpers.
 * #endregion moduleContract
 */
import { describe, expect, it } from "vitest";
import {
	cutAtWord,
	due,
	foldPositions,
	joinBody,
	topRangeOf,
} from "../src/domain/tree.js";
import type { Range } from "../src/types/tree.js";

const range = (start: number, level: number): Range => ({ start, level });

function referenceFold(
	positions: readonly number[],
	total: number,
	budget: number,
): Range[] {
	const live = (r: Range) =>
		positions.some((pos) => pos >= r.start && pos < r.start + 2 ** r.level);
	const highest = Math.max(...positions);
	const blocks = Array.from({ length: total }, (_, pos) => range(pos, 0));
	while (blocks.filter(live).length > budget) {
		const options: { index: number; range: Range; jump: number }[] = [];
		for (let i = 0; i + 1 < blocks.length; i += 1) {
			const left = blocks[i];
			const right = blocks[i + 1];
			if (!left || !right || left.level !== right.level) continue;
			const parent = range(left.start, left.level + 1);
			const end = parent.start + 2 ** parent.level;
			if (
				right.start !== left.start + 2 ** left.level ||
				left.start % 2 ** parent.level ||
				end > total ||
				(highest >= left.start && highest < end)
			)
				continue;
			const jump = [blocks[i - 1], blocks[i + 2]].reduce(
				(sum, n) => sum + (n ? Math.max(0, parent.level - 1 - n.level) : 0),
				0,
			);
			options.push({ index: i, range: parent, jump });
		}
		options.sort(
			(a, b) =>
				a.jump - b.jump ||
				due(total, range(b.range.start, b.range.level - 1)) -
					due(total, range(a.range.start, a.range.level - 1)) ||
				a.range.level - b.range.level ||
				a.range.start - b.range.start,
		);
		const best = options[0];
		if (!best) break;
		blocks.splice(best.index, 2, best.range);
	}
	const visible = blocks.filter(live);
	return visible.slice(Math.max(0, visible.length - Math.max(1, budget)));
}

describe("range and fold", () => {
	it("keeps the top range of the assigned extent", () => {
		expect(topRangeOf(0)).toBeNull();
		expect(topRangeOf(1)).toEqual(range(0, 1));
		expect(topRangeOf(5)).toEqual(range(0, 3));
		expect(topRangeOf(2 ** 40)).toEqual(range(0, 40));
		expect(due(100, range(0, 2))).toBe(23.25);
		expect(due(100, range(8, 2))).toBe(21.25);
	});

	it("matches the dense pair rules for dense and sparse scopes", () => {
		for (let mask = 1; mask < 256; mask += 1) {
			const positions = Array.from({ length: 8 }, (_, pos) => pos).filter(
				(pos) => mask & (2 ** pos),
			);
			for (let budget = 0; budget <= 8; budget += 1)
				expect(
					foldPositions(positions, 8, budget),
					`mask=${mask}, budget=${budget}`,
				).toEqual(referenceFold(positions, 8, budget));
		}
		for (const count of [11, 16, 23, 60]) {
			for (let budget = 1; budget <= 20; budget += 1) {
				for (let seed = 0; seed <= 12; seed += 1) {
					const positions = Array.from(
						{ length: count },
						(_, pos) => pos,
					).filter((pos) => seed === 0 || (pos * 13 + seed * 7) % 17 < 5);
					expect(
						foldPositions(positions, count, budget),
						`count=${count}, seed=${seed}, budget=${budget}`,
					).toEqual(referenceFold(positions, count, budget));
				}
			}
		}
	});

	it("handles empty lists, zero budget, and large sparse positions", () => {
		expect(foldPositions([], 8, 3)).toEqual([]);
		expect(foldPositions([0, 1, 2, 3, 7], 8, 0)).toEqual([range(7, 0)]);
		expect(foldPositions([0, 1, 2, 3, 7], 8, 2)).toEqual([
			range(0, 2),
			range(7, 0),
		]);
		const high = 2 ** 40 - 1;
		expect(foldPositions([high], high + 1, 1)).toEqual([range(high, 0)]);
	});
});

describe("text helpers", () => {
	it("cuts at a word boundary or at the limit", () => {
		expect(cutAtWord("short text", 10)).toBe("short text");
		expect(cutAtWord("one two three", 8)).toBe("one two");
		expect(cutAtWord("abcdefgh", 4)).toBe("abcd");
	});
	it("joins short texts and shares the available space", () => {
		expect(joinBody("one", "two", 10)).toBe("one; two");
		expect(joinBody("", "abcdef", 3)).toBe("abc");
		const equal = joinBody("a".repeat(600), "b".repeat(600), 640);
		const [left, right] = equal.split("; ");
		expect(equal.length).toBeLessThanOrEqual(640);
		expect(Math.abs((left?.length ?? 0) - (right?.length ?? 0))).toBeLessThan(
			3,
		);
		const uneven = joinBody("a".repeat(600), "b".repeat(40), 640);
		expect(uneven.length).toBeLessThanOrEqual(640);
		expect(uneven.endsWith(`; ${"b".repeat(40)}`)).toBe(true);
	});
});
