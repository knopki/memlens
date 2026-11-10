/**
 * #region moduleContract
 * @purpose Preserve one deterministic event history without restoring erased content.
 * @scope Validated id union and conflict resolution. No invalidation planning or file access.
 * @invariants Every copy passes validation. Input objects stay unchanged.
 * @invariants Sanitized copies win before time or hash. Losing copies still supply redaction and invalidation evidence.
 * #endregion moduleContract
 */

import { createHash } from "node:crypto";
import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";
import type { InvalidateEvent, JsonlLine, Ulid } from "../types/events.js";
import { redactionClosure } from "./sanitization.js";
import { validateEvent, validateTargets } from "./validation.js";

const debug = debuglog("memlens:merge");

/** The changed ids compare the final sanitized union with the local history. */
export interface MergeResult {
	readonly events: readonly JsonlLine[];
	readonly added: readonly Ulid[];
	readonly replaced: readonly Ulid[];
	/** Targets from every valid copy, including losing copies and partial histories. */
	readonly invalidationEvidence: readonly Pick<
		InvalidateEvent,
		"scope" | "targets"
	>[];
}

// #region FUNC_canonicalJson
/**
 * @purpose Give event equality and conflict hashes one stable representation.
 * @invariants Sort object keys at every depth. Preserve array order and string values.
 * @requires The value contains JSON data only.
 */
export function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (value !== null && typeof value === "object") {
		const object = value as Record<string, unknown>;
		return `{${Object.keys(object)
			.sort()
			.map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}
// #endregion FUNC_canonicalJson

// #region FUNC_mergeEvents
/**
 * @purpose Join validated events by id and apply all historical erasure evidence.
 * @invariants Valid payload conflicts select one winner without a conflict error.
 * @invariants Return unique ids in canonical event order. Validate known targets after conflict resolution.
 * @invariants Missing imported targets remain valid. Identical repeated imports report no changes.
 * @invariants Return invalidation evidence from all copies. The caller must persist targets absent from the winning history.
 */
export function mergeEvents(
	local: readonly unknown[],
	incoming: readonly unknown[],
): MergeResult {
	if (!Array.isArray(local) || !Array.isArray(incoming))
		throw new MemlensError("Data", "An event history must be an array.");
	debug("Merge start", {
		event: "start",
		local: local.length,
		incoming: incoming.length,
	});
	const previous = local.map(validateEvent);
	const supplied = incoming.map(validateEvent);
	const winners = new Map<Ulid, JsonlLine>();
	const invalidationCopies: InvalidateEvent[] = [];
	for (const event of [...previous, ...supplied]) {
		if (event.op === "invalidate") invalidationCopies.push(event);
		const current = winners.get(event.id);
		if (!current || compareCopies(event, current) > 0)
			winners.set(event.id, event);
	}
	const events = [
		...redactionClosure([...winners.values()], [...previous, ...supplied]),
	].sort((a, b) =>
		a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
	);
	validateTargets([...events, ...invalidationCopies], true);
	const localById = new Map(previous.map((event) => [event.id, event]));
	const added: Ulid[] = [];
	const replaced: Ulid[] = [];
	for (const event of events) {
		const old = localById.get(event.id);
		if (!old) added.push(event.id);
		else if (canonicalJson(old) !== canonicalJson(event))
			replaced.push(event.id);
	}
	debug("Merge complete", {
		event: "complete",
		events: events.length,
		added: added.length,
		replaced: replaced.length,
	});
	return {
		events,
		added,
		replaced,
		invalidationEvidence: invalidationCopies.map(({ scope, targets }) => ({
			scope,
			targets,
		})),
	};
}
// #endregion FUNC_mergeEvents

// #region FUNC_compareCopies
/**
 * @purpose Resolve an id conflict with the same result in either import direction.
 * @invariants Prefer sanitized status, then later at, then greater SHA-256 of canonical JSON.
 * @invariants Log the winner and reason for sanitized, time, and hash decisions without event content.
 */
function compareCopies(left: JsonlLine, right: JsonlLine): number {
	const sanitized =
		Number(left.redacted === true) - Number(right.redacted === true);
	let result: number;
	let reason: "sanitized" | "time" | "hash";
	if (sanitized) {
		result = sanitized;
		reason = "sanitized";
	} else if (left.at !== right.at) {
		result = left.at < right.at ? -1 : 1;
		reason = "time";
	} else {
		const a = canonicalJson(left);
		const b = canonicalJson(right);
		if (a === b) return 0;
		const hashA = createHash("sha256").update(a).digest("hex");
		const hashB = createHash("sha256").update(b).digest("hex");
		result = hashA < hashB ? -1 : hashA > hashB ? 1 : a < b ? -1 : 1;
		reason = "hash";
	}
	debug("Conflict resolved", {
		event: "conflict",
		id: left.id,
		winner: result > 0 ? "left" : "right",
		reason,
	});
	return result;
}
// #endregion FUNC_compareCopies
