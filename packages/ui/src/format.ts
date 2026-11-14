/**
 * #region moduleContract
 * @purpose Turn the store positions, ranges, and times into the short text of a console line.
 * Each screen names one target in the same way.
 * @scope The record address, the range id, the parsed range, the line text, the date span, and the
 * kind name. NOT: the markup and the store reads.
 * @invariants A range id holds the start and the end of the range.
 * @dependencies USES TYPE: the tree types and the note kinds.
 * @keywords address, range, line, text, date, kind
 * #endregion moduleContract
 */

import type { NoteKind } from "../../core/src/types/primitives.js";
import type { Range, SliceLine } from "../../core/src/types/tree.js";
import { KIND_KEYS, type Table } from "./i18n.js";
import { tr } from "./state.js";

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

export const kindName = (kind: NoteKind | "unavailable") =>
	kind === "unavailable" ? tr("none") : tr(KIND_KEYS[kind] as keyof Table);
