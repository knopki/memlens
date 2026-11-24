/**
 * #region moduleContract
 * @modulecontract
 * @purpose Give the date form of one range, so a range line names its span once.
 * @scope The date text of two ISO 8601 times. NOT: the clock, the time of day, and the tree.
 * @keywords date, span, range, text, view
 * #endregion moduleContract
 */

import { dayOf } from "./day.js";

// #region FUNC_dateSpan
/**
 * @purpose Put one period into the date form of the view, so a range line names its span once.
 * @invariants Equal dates give one date. One year and month give 2026-11-01..02. One year gives
 * 2026-11-28..12-03. Another year gives the two complete dates. A time of day leaves the span.
 */
export function dateSpan(from: string, to: string): string {
	const first = dayOf(from);
	const last = dayOf(to);
	if (!first || !last) return `${first}..${last}`;
	if (first === last) return first;
	const [yearA, monthA] = first.split("-");
	const [yearB, monthB, dayB] = last.split("-");
	if (yearA === yearB && monthA === monthB) return `${first}..${dayB}`;
	if (yearA === yearB) return `${first}..${monthB}-${dayB}`;
	return `${first}..${last}`;
}
// #endregion FUNC_dateSpan
