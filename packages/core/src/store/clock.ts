/**
 * #region moduleContract
 * @modulecontract
 * @purpose Give every change one total order through the hybrid logical clock, so a merge has no tie.
 * @scope The version text, the store identity, and the tick of a local write.
 * @invariants A version is `physical|counter|store_id`. Text comparison gives the order, and the clock never decreases.
 * @invariants Store id comparison breaks a tie, so two stores never issue the same version.
 * @dependencies node:crypto for the store identity.
 * @keywords clock, version, hlc, tick, receive, store id
 * #endregion moduleContract
 */

import { randomUUID } from "node:crypto";
import { debuglog } from "node:util";

const debug = debuglog("memlens:clock");

/** A version text: physical time, counter, and the store identity. */
export type Version = string;

/** The state of the clock. The store keeps it in the meta table. */
export interface ClockState {
	/** The physical part of the last issued version, in milliseconds. */
	readonly physical: number;

	/** The counter of the last issued version inside one millisecond. */
	readonly counter: number;

	/** The identity of this store. It never changes after creation. */
	readonly store: string;
}

// #region FUNC_storeId
/** @purpose Mint the identity of a new store. The identity breaks every version tie. */
export function storeId(): string {
	return randomUUID();
}
// #endregion FUNC_storeId

// #region FUNC_formatVersion
/**
 * @purpose Render one version as a text that sorts by the order of its parts.
 * @invariants Both numbers take a fixed width, so text order equals numeric order.
 */
export function formatVersion(state: ClockState): Version {
	return `${String(state.physical).padStart(13, "0")}|${String(
		state.counter,
	).padStart(6, "0")}|${state.store}`;
}
// #endregion FUNC_formatVersion

// #region FUNC_parseVersion
/**
 * @purpose Read one version text into its parts.
 * @returns The parts, or null when the text is not a version.
 */
export function parseVersion(value: string): ClockState | null {
	const match = /^(\d{13})\|(\d{6})\|(.+)$/.exec(value);
	if (!match?.[1] || !match[2] || !match[3]) return null;
	return {
		physical: Number(match[1]),
		counter: Number(match[2]),
		store: match[3],
	};
}
// #endregion FUNC_parseVersion

// #region FUNC_tick
/**
 * @purpose Give a local write a version greater than each version the store has seen.
 * @invariants The physical part never decreases, so a backward clock jump changes no order.
 * @returns The new clock state and its version text.
 */
export function tick(
	state: ClockState,
	now = Date.now(),
): { state: ClockState; version: Version } {
	const physical = Math.max(now, state.physical);
	const counter = physical === state.physical ? state.counter + 1 : 0;
	const next = { physical, counter, store: state.store };
	debug("Clock tick", { event: "tick", physical, counter });
	return { state: next, version: formatVersion(next) };
}
// #endregion FUNC_tick
