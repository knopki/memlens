/**
 * #region moduleContract
 * @modulecontract
 * @purpose Resolve one note target through the scope policy of its caller.
 * @scope Note addresses and numeric positions. NOT: range reads or address grammar.
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { byAddress } from "../store/reads.js";
import type { Store } from "../store/store.js";
import type { Note } from "../store/types.js";
import { MemlensError } from "../types/errors.js";
import type { ScopeKey } from "../types/primitives.js";
import { parseAddress } from "./address.js";

const debug = debuglog("memlens:target");

// #region FUNC_resolveTarget
/**
 * @purpose Read one target note with the scope policy of its host.
 * @invariants The scope policy runs before the row read, including for the fallback scope.
 *   The caller can permit an outside scope to create a proposal.
 */
export function resolveTarget(
	store: Store,
	fallback: string | null,
	address: string | number,
	canSee: (raw: string) => ScopeKey,
): Note {
	const parsed =
		typeof address === "number"
			? { kind: "pos" as const, scope: null, pos: address }
			: parseAddress(address);
	if (!parsed || parsed.kind === "range" || parsed.kind === "scoped-range")
		throw new MemlensError(
			"Usage",
			`The target ${address} is not a note address.`,
		);
	const raw = parsed.scope ?? fallback;
	if (raw === null)
		throw new MemlensError(
			"Usage",
			"The target needs a scope in the address or in --scope.",
		);
	const scope = canSee(raw);
	const row = byAddress(store, scope, parsed.pos);
	if (row === null)
		throw new MemlensError(
			"Data",
			`No record of ${scope} is at ${parsed.pos}.`,
		);
	debug("Target resolved", { event: "resolve", scope, pos: row.pos });
	return row;
}
// #endregion FUNC_resolveTarget
