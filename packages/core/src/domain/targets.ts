/**
 * Target resolution.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Turn a target text and one scope flag into one record, so each frontend shares one rule.
 * @scope
 *  - The use of the address grammar, the scope of the address or the flag, and the record lookup.
 *  - NOT: the grammar itself, the projection, the store, and the output of a frontend.
 * @invariants
 *  - A target with no scope in the address and no scope flag gives a Usage error.
 *  - A range target gives a Usage error.
 *  - A scope outside the given visible list gives NotAllowed.
 *  - An address that names no record gives a Data error.
 * @dependencies USES API: address.ts, scope.ts, errors.ts; READS: Projection
 * @keywords target, address, scope, resolve, record
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";
import type { ScopeKey } from "../types/events.js";
import type { Projection, ProjectionRecord } from "../types/projection.js";
import { parseAddress } from "./address.js";
import { normalizeScopeKey } from "./scope.js";

const debug = debuglog("memlens:targets");

/** One resolved target: the scope that holds the record and the record. */
export interface ResolvedTarget {
	readonly scope: ScopeKey;
	readonly record: ProjectionRecord;
}

// #region FUNC_resolveTarget
/**
 * @purpose Map a target text and a scope flag to one record, so a frontend holds no address rule.
 * @requires The projection is current. The visible list holds the scopes of the profile.
 * @param projection - The current projection.
 * @param visible - The visible scope keys of the profile.
 * @param raw - The target text, as the user or the agent typed it.
 * @param scopeFlag - The scope of the flag, or null.
 * @returns The scope and the record of the target.
 */
export function resolveTarget(
	projection: Projection,
	visible: readonly ScopeKey[],
	raw: string,
	scopeFlag: string | null,
): ResolvedTarget {
	const address = parseAddress(raw);
	if (address === null)
		throw new MemlensError("Usage", `The target ${raw} is not an address.`);
	if (address.kind === "range" || address.kind === "scoped-range")
		throw new MemlensError("Usage", `The target ${raw} must name one record.`);
	const rawScope = address.scope ?? scopeFlag ?? "";
	if (rawScope === "")
		throw new MemlensError(
			"Usage",
			"The target needs a scope in the address or in --scope.",
		);
	const scope = normalizeScopeKey(rawScope) as ScopeKey;
	if (!visible.includes(scope))
		throw new MemlensError("NotAllowed", `The scope ${scope} is not visible.`);
	const record = (projection.byScope.get(scope) ?? []).find(
		(candidate) => candidate.pos === address.pos,
	);
	if (record === undefined)
		throw new MemlensError(
			"Data",
			`No record of ${scope} is at ${address.pos}.`,
		);
	debug("Target resolved", { event: "target", scope, pos: address.pos });
	return { scope, record };
}
// #endregion FUNC_resolveTarget
