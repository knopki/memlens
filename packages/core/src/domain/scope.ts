/**
 * Scope key validation, normalization, and sanitization.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Validate, normalize, and sanitize scope keys, so the store writes no broken key.
 * @scope
 *  - Scope key validation, NFC normalization, kind lowercasing, and name sanitization.
 *  - NOT: configuration, profile filtering, or storage.
 * @invariants
 *  - A valid scope key has two segments separated by the first colon.
 *  - The kind starts with a lowercase letter or digit, and holds lowercase letters, digits, period,
 *    underscore, slash, and hyphen. The prefix `__` stays reserved for internal kinds.
 *  - The name holds any text except whitespace, control and format characters, `#`, comma, and
 *    brackets. The case and the script stay as given.
 *  - Normalization composes NFC and lowercases the kind. Validation checks the supplied key
 *    without normalization.
 *  - The concrete key test rejects a scope pattern, so a fallback names one scope only.
 * @keywords scope, key, validate, normalize, sanitize, segment, concrete
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { ScopeKey } from "../types/primitives.js";

const debug = debuglog("memlens:scope");

/** The catalog key prefix. The agent never sees this in the view. */
export const CATALOG_PREFIX = "__catalog__:";

/** The kind grammar: starts with [a-z0-9], continues with [a-z0-9._/-]. */
const KIND_RE = /^[a-z0-9][a-z0-9._/-]*$/;

/** The forbidden name signs: whitespace, control and format characters, #, comma, brackets. */
const FORBIDDEN_SOURCE = "[\\s#,\\[\\],\\p{Cc}\\p{Cf}]";

/** One test of the forbidden set, without the global flag. */
const FORBIDDEN_TEST = new RegExp(FORBIDDEN_SOURCE, "u");

/** The replacement form of the forbidden set, for sanitization. */
const FORBIDDEN_ALL = new RegExp(FORBIDDEN_SOURCE, "gu");

// #region FUNC_normalizeScopeKey
/**
 * @purpose Normalize one scope key before writing, so one composition and one kind case give one
 * scope.
 * @invariants The text composes to NFC. The part before the first colon lowercases, and the name
 * keeps its case and script.
 * @param raw - The scope key as supplied by the caller.
 * @returns The normalized key text.
 */
export function normalizeScopeKey(raw: string): string {
	const nfc = raw.normalize("NFC");
	const colon = nfc.indexOf(":");
	const result =
		colon < 1 ? nfc : `${nfc.slice(0, colon).toLowerCase()}${nfc.slice(colon)}`;
	debug("Scope key normalized", { event: "normalize", raw, result });
	return result;
}
// #endregion FUNC_normalizeScopeKey

// #region FUNC_sanitizeName
/**
 * @purpose Replace each forbidden sign of one derived name with one underscore, so one directory
 * or workspace name always gives one valid name.
 * @invariants The text composes to NFC first. Each forbidden sign becomes one underscore, and each
 * other character keeps its form and length.
 * @param name - The derived name text.
 * @returns The name with each forbidden sign replaced.
 */
export function sanitizeName(name: string): string {
	const result = name.normalize("NFC").replaceAll(FORBIDDEN_ALL, "_");
	debug("Name sanitized", { event: "sanitize", name, result });
	return result;
}
// #endregion FUNC_sanitizeName

// #region FUNC_validateScopeKey
/**
 * @purpose Reject a key that does not match the scope grammar, so no invalid key enters the store.
 * @invariants The kind matches the kind grammar, and the name holds at least one allowed
 * character.
 * @param key - The normalized key.
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
	const result = KIND_RE.test(kind) && !FORBIDDEN_TEST.test(name);
	debug("Scope key validated", { event: "validate", key, result });
	return result;
}
// #endregion FUNC_validateScopeKey

// #region FUNC_concreteScopeKey
/** @purpose Tell one concrete scope key from a profile pattern, so no fallback answers a pattern. */
export function concreteScopeKey(key: string): key is ScopeKey {
	return !key.includes("*") && validateScopeKey(key);
}
// #endregion FUNC_concreteScopeKey

// #region FUNC_isCatalogKey
/**
 * @purpose Keep a hidden key out of the view, so the agent names the scopes of its profile only.
 * @param key - The scope key to test.
 * @returns True when the key carries the hidden prefix.
 */
export function isCatalogKey(key: ScopeKey): boolean {
	return key.startsWith(CATALOG_PREFIX);
}
// #endregion FUNC_isCatalogKey
