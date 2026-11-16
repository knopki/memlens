/**
 * #region moduleContract
 * @purpose Turn the store positions and ranges into the short text of a console line, so both
 * console shells and the model name one target in the same way.
 * @scope The record address, the range id, the parsed range, the line text, and the date span. NOT:
 * the markup, the store reads, the state, and the localised kind name.
 * @invariants A range id holds the start and the end of the range.
 * @dependencies USES TYPE: the tree types.
 * @keywords address, range, line, text
 * #endregion moduleContract
 */

import type { Range, SliceLine } from "../../core/src/types/tree.js";

export const address = (record: { scope: string; pos: number }) =>
	`${record.scope}#${record.pos}`;

export const rangeId = (range: Range) =>
	`#${range.start}-${range.start + 2 ** range.level - 1}`;

// #region FUNC_rangeOf
/**
 * @purpose Read a range id back into its range.
 * @invariants A reload restores one open catalog line from this value.
 */
export function rangeOf(id: string): Range {
	const [start = 0, end = 0] = id.replace(/^#/, "").split("-").map(Number);
	return { start, level: Math.max(0, Math.log2(end - start + 1)) };
}
// #endregion FUNC_rangeOf

export const rangeAddress = (key: string, range: Range) =>
	`${key}${rangeId(range)}`;

export const lineAddress = (key: string, line: SliceLine) =>
	line.kind === "record" ? `${key}#${line.pos}` : rangeAddress(key, line.range);

// #region FUNC_lineText
/**
 * @purpose Give the text of one line.
 * @invariants A record line gives its body, a summary line gives its summary, and an assembled line
 * gives its text.
 */
export function lineText(line: SliceLine): string {
	return line.kind === "record"
		? line.body
		: line.kind === "summary"
			? line.summary
			: line.text;
}
// #endregion FUNC_lineText

// #region FUNC_localTime
/**
 * @purpose Format one ISO time string in the local zone of the browser, so a screen shows no UTC text.
 * @invariants An invalid input returns the raw string.
 * @param iso - The ISO time string of the host.
 */
export function localTime(iso: string): string {
	const date = new Date(iso);
	return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}
// #endregion FUNC_localTime
