/**
 * #region moduleContract
 * @purpose Name the addresses, the ranges, and the kinds of a line for a React screen, so a screen
 *   reads no global console state.
 * @scope The address, the range, the line text, and the localised kind name.
 * NOT: the state, the transport, and the markup.
 * @invariants Each helper takes its message function, so a screen shows the language of its host.
 * @invariants The module reads no DOM and no global state.
 * @dependencies USES: the pure address helpers and the kind message keys.
 * @keywords format, address, range, line, kind, label
 * #endregion moduleContract
 */

import type { NoteKind } from "../../../core/src/types/primitives.js";
import { KIND_KEYS, type Table } from "../i18n.js";
import type { Translate } from "./console.js";

export {
	address,
	lineAddress,
	lineText,
	localTime,
	rangeAddress,
	rangeId,
	rangeOf,
} from "../format.js";

// #region FUNC_kindName
/**
 * @purpose Give the localised name of one note kind.
 * @param t - The message function of the host language.
 * @param kind - The kind of the record, or `unavailable` for a line without one.
 */
export function kindName(t: Translate, kind: NoteKind | "unavailable"): string {
	return kind === "unavailable" ? t("none") : t(KIND_KEYS[kind] as keyof Table);
}
// #endregion FUNC_kindName
