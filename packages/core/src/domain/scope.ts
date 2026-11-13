/**
 * Scope key validation and normalization.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Validate and normalize scope keys, so the store writes no invalid or inconsistent key.
 * @scope
 *  - Scope key validation, lowercase normalization, and catalog key helpers.
 *  - NOT: configuration, profile filtering, or storage.
 * @invariants
 *  - A valid scope key has two segments separated by a colon.
 *  - Each segment starts with a lowercase letter or digit.
 *  - Each segment holds lowercase letters, digits, period, underscore, slash, and hyphen.
 *  - Validation checks the supplied key without normalization.
 * @keywords scope, key, validate, normalize, segment
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { ScopeKey } from "../types/events.js";

const debug = debuglog("memlens:scope");

/** The catalog key prefix. The agent never sees this in the view. */
export const CATALOG_PREFIX = "__catalog__:";

/** The segment grammar: starts with [a-z0-9], continues with [a-z0-9._/-]. */
const SEGMENT_RE = /^[a-z0-9][a-z0-9._/-]*$/;

// #region FUNC_normalizeScopeKey

/**
 * @purpose Normalize a scope key to lowercase before writing, so a wrong case does not create a new scope.
 * @param raw - The scope key as supplied by the caller.
 * @returns The normalized lowercase key.
 */
export function normalizeScopeKey(raw: string): string {
	const result = raw.toLowerCase();
	debug("Scope key normalized", { event: "normalize", raw, result });
	return result;
}

// #endregion FUNC_normalizeScopeKey

// #region FUNC_validateScopeKey

/**
 * @purpose Reject a key that does not match the scope grammar, so no invalid key enters the store.
 * @param key - The normalized scope key.
 * @returns True when the key matches the grammar.
 */
export function validateScopeKey(key: string): key is ScopeKey {
	const colonIdx = key.indexOf(":");
	if (colonIdx < 1) {
		debug("Scope key invalid: no colon or empty kind", { key });
		return false;
	}
	const kind = key.slice(0, colonIdx);
	const name = key.slice(colonIdx + 1);
	if (name.length === 0) {
		debug("Scope key invalid: empty name", { key });
		return false;
	}
	const result = SEGMENT_RE.test(kind) && SEGMENT_RE.test(name);
	debug("Scope key validated", { event: "validate", key, result });
	return result;
}

// #endregion FUNC_validateScopeKey

/** Check whether a key is a hidden catalog key. */
export function isCatalogKey(key: ScopeKey): boolean {
	return key.startsWith(CATALOG_PREFIX);
}

/** Build the catalog scope key for a profile. */
export function catalogKey(profile: string): ScopeKey {
	return `${CATALOG_PREFIX}${profile}`;
}
