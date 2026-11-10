/**
 * Event ordering and comparison.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Define the canonical event order (at, id), so the projection processes events deterministically.
 * @scope
 *  - The order key construction from (at, id).
 *  - Order comparison as text.
 *  - NOT: event validation, projection logic, or time zones.
 * @invariants
 *  - The order key is `${at}|${id}`.
 *  - Two orders compare as their text compares.
 * @keywords order, canonical, at, id, sort, compare
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { IsoTime, Ulid } from "../types/events.js";
import type { Order } from "../types/tree.js";

const debug = debuglog("memlens:order");

// #region FUNC_makeOrder
/**
 * @purpose Make the order key from (at, id), so the projection sorts events deterministically.
 */
export function makeOrder(at: IsoTime, id: Ulid): Order {
	const result: Order = `${at}|${id}`;
	debug("Order made", { event: "make", at, id, result });
	return result;
}
// #endregion FUNC_makeOrder

// #region FUNC_compareOrder
/**
 * @purpose Compare two orders as text, so the projection applies events in the correct sequence.
 */
export function compareOrder(a: Order, b: Order): number {
	return a < b ? -1 : a > b ? 1 : 0;
}
// #endregion FUNC_compareOrder

// #region FUNC_maxOrder
/**
 * @purpose Find the greater of two orders, treating null as less than any order.
 */
export function maxOrder(a: Order | null, b: Order | null): Order | null {
	if (a === null) return b;
	if (b === null) return a;
	return compareOrder(a, b) >= 0 ? a : b;
}
// #endregion FUNC_maxOrder
