/**
 * #region moduleContract
 * @purpose Turn the store positions and ranges into the short text of a console line, so both
 * console shells and the model name one target in the same way.
 * @scope The line address, the line text, and the local time. NOT: the address grammar, the markup,
 * the store reads, the state, and the localised kind name.
 * @keywords address, range, line, text
 * #endregion moduleContract
 */

import type { SliceLine } from "@memlens/core";
import { readRange, renderAddress, renderRange } from "@memlens/core/view";

export { readRange, renderAddress, renderRange };

export const lineAddress = (key: string, line: SliceLine) =>
	line.kind === "record"
		? renderAddress(key, line.pos, null)
		: renderRange(key, line.range);

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
