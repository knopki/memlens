/**
 * Address parsing and rendering.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Parse and render record addresses, so the tools and the CLI share one address grammar.
 * @scope
 *  - Parsing of pos, pos-pos, scope#pos, and scope#pos-pos.
 *  - Rendering of addresses with a leading #.
 *  - NOT: pos allocation, scope resolution, or record lookup.
 * @invariants
 *  - An address is pos, pos-pos, scope#pos, or scope#pos-pos.
 *  - Positions are non-negative integers. A range end is not before its start.
 * @dependencies scope.ts for scope key validation
 * @keywords address, pos, range, scope, addr, parse, render
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { ScopeKey } from "../types/events.js";
import type { Pos } from "../types/tree.js";
import { validateScopeKey } from "./scope.js";

const debug = debuglog("memlens:address");

/** A parsed record address. */
export type ParsedAddress =
	| { readonly kind: "pos"; readonly pos: Pos; readonly scope: null }
	| {
			readonly kind: "range";
			readonly start: Pos;
			readonly end: Pos;
			readonly scope: null;
	  }
	| { readonly kind: "scoped-pos"; readonly scope: ScopeKey; readonly pos: Pos }
	| {
			readonly kind: "scoped-range";
			readonly scope: ScopeKey;
			readonly start: Pos;
			readonly end: Pos;
	  };

// #region FUNC_parseAddress
/**
 * @purpose Parse a string address into its parts, so a tool call or CLI argument maps to a record.
 * @invariants Strip one leading # before the parse. Invalid address text gives null.
 * @param raw - The address string, with or without a leading #.
 * @returns The parsed address, or null when the input does not match the grammar.
 */
export function parseAddress(raw: string): ParsedAddress | null {
	// Strip one leading #
	const s = raw.startsWith("#") ? raw.slice(1) : raw;
	debug("Address parse start", { event: "parse", raw, stripped: s });

	// Try scope#rest
	const hashIdx = s.indexOf("#");
	if (hashIdx > 0) {
		const scopePart = s.slice(0, hashIdx);
		const rest = s.slice(hashIdx + 1);
		if (!validateScopeKey(scopePart)) {
			debug("Address parse: invalid scope key", { scopePart });
			return null;
		}
		const range = parseRange(rest);
		if (range === null) {
			debug("Address parse: invalid pos or range", { rest });
			return null;
		}
		const result: ParsedAddress =
			range.end === null
				? { kind: "scoped-pos", scope: scopePart, pos: range.start }
				: {
						kind: "scoped-range",
						scope: scopePart,
						start: range.start,
						end: range.end,
					};
		debug("Address parse done", { result });
		return result;
	}

	// Try pos or pos-pos
	const range = parseRange(s);
	if (range === null) {
		debug("Address parse: not a pos or range", { s });
		return null;
	}
	const result: ParsedAddress =
		range.end === null
			? { kind: "pos", pos: range.start, scope: null }
			: { kind: "range", start: range.start, end: range.end, scope: null };
	debug("Address parse done", { result });
	return result;
}
// #endregion FUNC_parseAddress

/** Parse a string of the form N or N-M. Returns null on failure. */
function parseRange(s: string): { start: Pos; end: Pos | null } | null {
	const dashIdx = s.indexOf("-");
	if (dashIdx > 0) {
		const startStr = s.slice(0, dashIdx);
		const endStr = s.slice(dashIdx + 1);
		const start = parseNonNegInt(startStr);
		const end = parseNonNegInt(endStr);
		if (start === null || end === null || end < start) return null;
		return { start, end };
	}
	const pos = parseNonNegInt(s);
	if (pos === null) return null;
	return { start: pos, end: null };
}

function parseNonNegInt(s: string): number | null {
	if (!/^\d+$/.test(s)) return null;
	const n = Number(s);
	if (!Number.isInteger(n) || n < 0) return null;
	return n;
}

// #region FUNC_renderAddress
/**
 * @purpose Render a pos or range in the address form of a slice line.
 * @invariants A local address starts with #. A scoped address starts with scope#.
 * @param scope - The scope key, or null for the active scope.
 * @param start - The start position.
 * @param end - The end position, or null for a single record.
 * @returns The rendered address string with a leading #.
 */
export function renderAddress(
	scope: ScopeKey | null,
	start: Pos,
	end: Pos | null,
): string {
	const range = end === null ? String(start) : `${start}-${end}`;
	const result = scope === null ? `#${range}` : `${scope}#${range}`;
	debug("Address rendered", { scope, start, end, result });
	return result;
}
// #endregion FUNC_renderAddress
