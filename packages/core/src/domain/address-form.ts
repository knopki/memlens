/**
 * Address render form.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Render the address of a position or a range, and read a range back, so the tools and
 *   the browser bundle share one grammar.
 * @scope The render form of a position and of a range, and the range of one range text. NOT: the
 *   scope key, the store read, and the record lookup.
 * @keywords address, pos, range, render, read, width
 * #endregion moduleContract
 */

import type { Pos, Range } from "../types/tree.js";

// #region FUNC_renderAddress
/**
 * @purpose Render a pos or range in the address form of a slice line.
 * @invariants A local address starts with #. A scoped address starts with scope#.
 */
export function renderAddress(
	scope: string | null,
	start: Pos,
	end: Pos | null,
): string {
	const range = end === null ? String(start) : `${start}-${end}`;
	return scope === null ? `#${range}` : `${scope}#${range}`;
}
// #endregion FUNC_renderAddress

export const renderRange = (scope: string | null, range: Range): string =>
	renderAddress(scope, range.start, range.start + 2 ** range.level - 1);

// #region FUNC_readRange
/**
 * @purpose Read one range back from its address text.
 * @invariants A width that is not a power of two gives null, so the level stays the whole number
 *   that the store writes.
 */
export function readRange(raw: string): Range | null {
	const match = /^#?(\d+)-(\d+)$/.exec(raw);
	if (!match?.[1] || !match[2]) return null;
	const start = Number(match[1]);
	const end = Number(match[2]);
	const width = end - start + 1;
	const level = Math.log2(width);
	if (width < 1 || !Number.isInteger(level) || 2 ** level !== width)
		return null;
	return { start, level };
}
// #endregion FUNC_readRange
