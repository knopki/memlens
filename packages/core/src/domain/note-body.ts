/**
 * Note body validation and normalization.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Validate and normalize the body and longform of a note, so the store enforces the limits.
 * @scope
 *  - Body limit (512 chars), declared size (384 chars), longform limit (16 384 chars).
 *  - Whitespace normalization of the body.
 *  - Overflow: text above the body limit moves into the longform.
 * @keywords body, longform, limit, normalize, overflow
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";

const debug = debuglog("memlens:note-body");

export const BODY_HARD_LIMIT = 512;

export const LONGFORM_LIMIT = 16_384;

// #region FUNC_normalizeBody
/**
 * @purpose Trim the ends of the body and collapse runs of whitespace to one space.
 * @invariants The result has no leading or trailing whitespace. Each run of whitespace becomes one space.
 */
export function normalizeBody(raw: string): string {
	const result = raw.replace(/\s+/g, " ").trim();
	debug("Body normalized", {
		event: "normalize",
		originalLength: raw.length,
		resultLength: result.length,
	});
	return result;
}
// #endregion FUNC_normalizeBody

// #region FUNC_splitBody
/**
 * @purpose Keep the body within its limit without losing excess content.
 * @invariants The body has at most 512 characters. Move excess text before the existing longform.
 * @invariants A longform above 16 384 characters causes a Data error, including after the move.
 * @invariants Cut at the last space within the limit. Without such a space, cut at the character limit.
 * @param body - The normalized body text.
 * @param existingLongform - The existing longform, or null.
 * @returns An object with the split body and the combined longform.
 */
export function splitBody(
	body: string,
	existingLongform: string | null,
): { body: string; longform: string | null } {
	if (existingLongform !== null && existingLongform.length > LONGFORM_LIMIT) {
		debug("Longform rejected", {
			event: "too_long",
			length: existingLongform.length,
			limit: LONGFORM_LIMIT,
		});
		throw new MemlensError("Data", "The longform exceeds 16384 characters.");
	}
	if (body.length <= BODY_HARD_LIMIT) {
		debug("Body split: within limit", { length: body.length });
		return { body, longform: existingLongform };
	}

	let cutAt = BODY_HARD_LIMIT;
	while (cutAt > 0 && body[cutAt] !== " ") {
		cutAt--;
	}
	if (cutAt === 0) cutAt = BODY_HARD_LIMIT;

	const keptBody = body.slice(0, cutAt).trimEnd();
	const overflow = body.slice(cutAt).trimStart();
	const combined = `${overflow}${existingLongform ? `\n${existingLongform}` : ""}`;
	if (combined.length > LONGFORM_LIMIT) {
		debug("Longform rejected", {
			event: "too_long",
			length: combined.length,
			limit: LONGFORM_LIMIT,
		});
		throw new MemlensError("Data", "The longform exceeds 16384 characters.");
	}
	const longform = combined || null;

	debug("Body split: overflow", {
		event: "split",
		originalLength: body.length,
		keptLength: keptBody.length,
		overflowLength: overflow.length,
	});
	return { body: keptBody, longform };
}
// #endregion FUNC_splitBody
