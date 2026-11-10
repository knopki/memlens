/**
 * #region moduleContract
 * @modulecontract
 * @purpose Prevent erased event content from returning through historical events or imported copies.
 * @scope Content sanitization and historical dependency closure. No conflict resolution or store publication.
 * @invariants Input events stay unchanged. Sanitization preserves operations and all structural metadata.
 * @invariants Repeated sanitization and closure produce the same values.
 * @keywords redaction, sanitization, closure, historical dependencies
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { JsonlLine } from "../types/events.js";

const debug = debuglog("memlens:sanitization");

// #region FUNC_sanitizeEvent
/**
 * @purpose Produce the sanitized form of a note, amendment, or node.
 * @invariants Sanitized content events have redacted true. Notes have body "" and longform null. Nodes have summary "" and chars 0.
 * @invariants Amendments clear present body to "" and present longform to null. Absent fields stay absent. Other operations stay unchanged.
 */
export function sanitizeEvent(event: JsonlLine): JsonlLine {
	switch (event.op) {
		case "note":
			debug("Clear note", { id: event.id });
			return { ...event, body: "", longform: null, redacted: true };
		case "amend": {
			debug("Clear amendment", { id: event.id, target: event.target });
			const { body: _body, longform: _longform, ...metadata } = event;
			return {
				...metadata,
				...(Object.hasOwn(event, "body") ? { body: "" as const } : {}),
				...(Object.hasOwn(event, "longform") ? { longform: null } : {}),
				redacted: true,
			};
		}
		case "node":
			debug("Clear node", { id: event.id });
			return { ...event, summary: "", chars: 0, redacted: true };
		default:
			return event;
	}
}
// #endregion FUNC_sanitizeEvent

// #region FUNC_collectEvidence
/**
 * @purpose Collect erasure evidence and child dependencies from every historical event copy.
 * @invariants Redact targets, sanitized note ids, and sanitized amendment targets identify erased records, even without a redact event.
 * @invariants Erasure includes original notes and every amendment of their ids, including historical and proposed amendments.
 * @invariants Both input histories contribute child_a and child_b edges, including copies that lose conflict resolution.
 */
function collectEvidence(batches: readonly (readonly JsonlLine[])[]) {
	const records = new Set<string>();
	const cleared = new Set<string>();
	const notes = new Set<string>();
	const inputs = new Map<string, Set<string>>();
	const parents = new Map<string, Set<string>>();
	const empty = new Set<string>();

	for (const batch of batches) {
		for (const event of batch) {
			if (event.op === "redact") records.add(event.target);
			if (event.redacted === true) {
				cleared.add(event.id);
				if (event.op === "note") records.add(event.id);
				if (event.op === "amend") records.add(event.target);
			}
			if (event.op === "note") notes.add(event.id);
			if (event.op !== "node") continue;
			let children = inputs.get(event.id);
			if (!children) {
				children = new Set();
				inputs.set(event.id, children);
			}
			if (event.child_a === null && event.child_b === null) empty.add(event.id);
			for (const child of [event.child_a, event.child_b]) {
				if (child === null) continue;
				children.add(child);
				let ancestors = parents.get(child);
				if (!ancestors) {
					ancestors = new Set();
					parents.set(child, ancestors);
				}
				ancestors.add(event.id);
			}
		}
	}

	for (const id of records) cleared.add(id);
	if (records.size > 0) {
		for (const batch of batches) {
			for (const event of batch) {
				if (event.op === "amend" && records.has(event.target))
					cleared.add(event.id);
			}
		}
	}
	return { records, cleared, notes, inputs, parents, empty };
}
// #endregion FUNC_collectEvidence

// #region FUNC_clearUnresolved
/**
 * @purpose Clear unresolved summaries conservatively when any erasure evidence exists.
 * @requires The history contains erasure evidence.
 * @invariants Missing note or node sources, cycles, and nodes without source input make their summary chains unresolved.
 */
function clearUnresolved({
	notes,
	inputs,
	parents,
	empty,
	cleared,
}: ReturnType<typeof collectEvidence>): number {
	// Resolve from known notes upward. Missing sources and cycles never enter the queue.
	const remaining = new Map<string, number>();
	for (const [id, children] of inputs) remaining.set(id, children.size);
	const resolved = new Set(notes);
	const sourceQueue = [...notes];
	for (let index = 0; index < sourceQueue.length; index++) {
		const id = sourceQueue[index];
		if (id === undefined) continue;
		for (const parent of parents.get(id) ?? []) {
			const count = (remaining.get(parent) ?? 0) - 1;
			remaining.set(parent, count);
			if (count === 0 && !empty.has(parent) && !resolved.has(parent)) {
				resolved.add(parent);
				sourceQueue.push(parent);
			}
		}
	}
	let unresolved = 0;
	for (const id of inputs.keys()) {
		if (!resolved.has(id)) {
			cleared.add(id);
			unresolved++;
		}
	}
	return unresolved;
}
// #endregion FUNC_clearUnresolved

// #region FUNC_clearAncestors
/**
 * @purpose Clear every historical node whose child dependencies reach an erased event id.
 * @invariants Follow event ids across all scopes and catalogs, including earlier scope paths, without current range coordinates.
 * @invariants Sanitized node ids clear summaries of ancestors only. Never clear child notes or unaffected sibling branches downward.
 */
function clearAncestors(
	cleared: Set<string>,
	parents: Map<string, Set<string>>,
): void {
	const clearQueue = [...cleared];
	for (let index = 0; index < clearQueue.length; index++) {
		const id = clearQueue[index];
		if (id === undefined) continue;
		for (const parent of parents.get(id) ?? []) {
			if (cleared.has(parent)) continue;
			cleared.add(parent);
			clearQueue.push(parent);
		}
	}
}
// #endregion FUNC_clearAncestors

// #region FUNC_redactionClosure
/**
 * @purpose Clear erased records and every historical summary that can expose their content.
 * @requires Both arrays contain valid events. Supply local and incoming histories before conflict resolution.
 * @invariants Return only events in their original order, including duplicate copies. Do not merge conflicts.
 * @invariants Without erasure evidence, preserve all summaries. Later complete inputs cannot restore a summary that already has redacted true.
 */
export function redactionClosure(
	events: readonly JsonlLine[],
	evidence: readonly JsonlLine[] = [],
): readonly JsonlLine[] {
	const history = collectEvidence([events, evidence]);
	const { records, cleared, parents } = history;
	if (cleared.size === 0) return events;
	const unresolved = clearUnresolved(history);
	clearAncestors(cleared, parents);
	debug("Redaction closure", {
		events: events.length,
		evidence: evidence.length,
		records: records.size,
		cleared: cleared.size,
		unresolved,
	});
	return events.map((event) =>
		cleared.has(event.id) ? sanitizeEvent(event) : event,
	);
}
// #endregion FUNC_redactionClosure
