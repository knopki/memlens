/**
 * ULID generation and comparison.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Generate unique time-sortable identifiers for stored notes and proposals.
 * @scope
 *  - ULID generation.
 *  - NOT: time validation, comparison, or storage.
 * @invariants
 *  - Two ULIDs generated at the same time sort by their random suffix.
 * @keywords ulid, id, identifier, sortable
 * #endregion moduleContract
 */

import { randomBytes } from "node:crypto";
import { debuglog } from "node:util";

const debug = debuglog("memlens:ulid");

// Crockford base32 alphabet
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const TIME_LEN = 10;

const RAND_LEN = 16;

// #region FUNC_ulid
/**
 * @purpose Generate a time-sortable ULID from the given timestamp, so stored notes sort by (ts, id).
 * @param timestampMs - The time of the write in milliseconds since epoch.
 * @returns A 26-character ULID string.
 */
export function ulid(timestampMs: number): string {
	const time = Math.floor(timestampMs);
	if (!Number.isFinite(time) || time < 0 || time > 2 ** 48 - 1) {
		throw new Error(`Invalid timestamp for ULID: ${timestampMs}`);
	}

	let timeStr = "";
	let rem = time;
	for (let i = TIME_LEN - 1; i >= 0; i--) {
		timeStr = ALPHABET[rem % 32] + timeStr;
		rem = Math.floor(rem / 32);
	}

	const rand = randomBytes(10);
	let randStr = "";
	let bits = 0n;
	for (let i = 0; i < 10; i++) {
		bits = (bits << 8n) | BigInt(rand[i] ?? 0);
	}
	for (let i = RAND_LEN - 1; i >= 0; i--) {
		randStr = ALPHABET[Number(bits % 32n)] + randStr;
		bits = bits / 32n;
	}

	const result = timeStr + randStr;
	debug("ULID generated", { event: "generated", len: result.length });
	return result;
}
// #endregion FUNC_ulid
