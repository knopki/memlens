/**
 * Time formatting and comparison.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Format and compare ISO 8601 UTC times, so stored times use one format that sorts as text.
 * @scope
 *  - Formatting of at, ts, and review_at as ISO 8601 UTC with Z.
 *  - Reading of the time of a note from the text of a write.
 *  - The date span of the view text: the shared year and month appear once.
 *  - NOT: time zones, local time, or a clock display.
 * @invariants
 *  - The text of at sorts by time.
 * @keywords time, iso, utc, format, compare
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { DAY } from "./day.js";

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

// #region FUNC_parseNoteTime
/**
 * @purpose Read the time of one note into the stored form, so the CLI and the tools parse one text in one way.
 * @invariants A day alone is the start of that day in the zone of the process.
 */
export function parseNoteTime(text: string): string | null {
	const time = Date.parse(DAY.test(text) ? `${text}T00:00:00` : text);
	const result = Number.isNaN(time) ? null : toIso(time);
	debug("Note time read", { event: "note_time", text, result });
	return result;
}
// #endregion FUNC_parseNoteTime

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

/** The most days that addDaysAtTime adds, so the result stays inside the Date range. */
export const MAX_ADD_DAYS = 99_000_000;

// #region FUNC_addDaysAtTime
/**
 * Add days to a time and keep the full UTC form.
 */
export function addDaysAtTime(d: Date | number, days: number): string {
	const date = typeof d === "number" ? new Date(d) : new Date(d.getTime());
	date.setUTCDate(date.getUTCDate() + days);
	const result = toIso(date);
	debug("Time shift", { event: "add_days_at_time", days, result });
	return result;
}
// #endregion FUNC_addDaysAtTime

// #region FUNC_compareIso
/**
 * Compare two ISO 8601 times as text. Returns negative, zero, or positive.
 */
export function compareIso(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
// #endregion FUNC_compareIso
