/**
 * Time formatting and comparison.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Format and compare ISO 8601 UTC times, so events use one time format that sorts as text.
 * @scope
 *  - Formatting of at and ts as ISO 8601 UTC with Z.
 *  - Formatting of review_at as YYYY-MM-DD.
 *  - The date span of the view text: the shared year and month appear once.
 *  - NOT: time zones, local time, or a clock display.
 * @invariants
 *  - The at and ts values end with Z.
 *  - The text of at sorts by time.
 *  - A date span holds no time of day.
 * @keywords time, iso, utc, format, compare
 * #endregion moduleContract
 */

import { debuglog } from "node:util";

const debug = debuglog("memlens:time");

// #region FUNC_nowIso
/**
 * @purpose Give the current time in ISO 8601 UTC with Z, so the log records one format.
 * @returns The current time as a string, for example 2026-11-10T17:44:58.000Z.
 */
export function nowIso(): string {
	const result = new Date().toISOString();
	debug("Time now", { event: "now", result });
	return result;
}
// #endregion FUNC_nowIso

// #region FUNC_toIso
/**
 * @purpose Convert a Date or a number to ISO 8601 UTC with Z, so the store writes one format.
 */
export function toIso(d: Date | number): string {
	const result =
		typeof d === "number" ? new Date(d).toISOString() : d.toISOString();
	debug("Time toIso", { event: "toIso", result });
	return result;
}
// #endregion FUNC_toIso

// #region FUNC_toIsoDate
/**
 * @purpose Format a Date or a number as YYYY-MM-DD, so the review_at field uses one date format.
 */
export function toIsoDate(d: Date | number): string {
	const date = typeof d === "number" ? new Date(d) : d;
	const result = date.toISOString().slice(0, 10);
	debug("Time toIsoDate", { event: "toIsoDate", result });
	return result;
}
// #endregion FUNC_toIsoDate

/**
 * Add days to a date and return the YYYY-MM-DD result.
 */
export function addDays(d: Date | number, days: number): string {
	const date = typeof d === "number" ? new Date(d) : new Date(d.getTime());
	date.setUTCDate(date.getUTCDate() + days);
	return toIsoDate(date);
}

/**
 * Compare two ISO 8601 times as text. Returns negative, zero, or positive.
 */
export function compareIso(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

// #region FUNC_dateSpan
/**
 * @purpose Put one period into the date form of the view, so a range line names its span once.
 * @invariants Equal dates give one date. One year and month give 2026-11-01..02. One year gives
 * 2026-11-28..12-03. Another year gives the two complete dates. A time of day leaves the span.
 */
export function dateSpan(from: string, to: string): string {
	const first = from.slice(0, 10);
	const last = to.slice(0, 10);
	if (!first || !last) return `${first}..${last}`;
	if (first === last) return first;
	const [yearA, monthA] = first.split("-");
	const [yearB, monthB, dayB] = last.split("-");
	if (yearA === yearB && monthA === monthB) return `${first}..${dayB}`;
	if (yearA === yearB) return `${first}..${monthB}-${dayB}`;
	return `${first}..${last}`;
}
// #endregion FUNC_dateSpan
