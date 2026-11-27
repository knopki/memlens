/**
 * #region moduleContract
 * @purpose Turn the store positions and ranges into the short text of a console line, so both
 * console shells and the model name one target in the same way.
 * @scope The line address, the line text, the local time, and the localised kind name. NOT: the
 * address grammar, the markup, the store reads, and the state.
 * @invariants Each helper takes no message function, except the kind name. It takes the function of
 * its host.
 * @keywords address, range, line, text, kind, label
 * #endregion moduleContract
 */

import type { NoteKind, SliceLine } from "@memlens/core";
import { readRange, renderAddress, renderRange } from "@memlens/core/view";
import { KIND_KEYS, type Table } from "./i18n.js";
import type { Translate } from "./model/console.js";

export { readRange, renderRange };

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

// #region FUNC_kindName
/** @purpose Give the localised name of one note kind. */
export function kindName(t: Translate, kind: NoteKind | "unavailable"): string {
	return kind === "unavailable" ? t("none") : t(KIND_KEYS[kind] as keyof Table);
}
// #endregion FUNC_kindName
