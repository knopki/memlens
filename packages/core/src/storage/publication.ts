/**
 * #region moduleContract
 * @purpose Keep publication envelopes and persisted snapshots consistent across both backends.
 * @scope Small publication helpers. No locks, file access, or storage lifecycle.
 * @invariants The backend owns the lock throughout preparation and publication.
 * @invariants Every planned invalidation becomes an event in the same publication as its source change.
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { ProfileScopes } from "../domain/invalidation.js";
import { maxOrder } from "../domain/order.js";
import { catalogTree, project, scopeTree } from "../domain/projection.js";
import { isCatalogKey } from "../domain/scope.js";
import { inputUnchanged, rev } from "../domain/tree.js";
import { ulid } from "../domain/ulid.js";
import { prepareAppend, type WritePlan } from "../domain/write.js";
import { MemlensError } from "../types/errors.js";
import type { JsonlLine, NodeEvent } from "../types/events.js";
import type { Projection } from "../types/projection.js";
import type { NodeAppendResult } from "../types/store.js";
import type { BuildInput } from "../types/tree.js";

const debug = debuglog("memlens:publication");

// #region FUNC_envelope
/** @purpose Give a local event a unique identity and a time after the current history. */
export function envelope(events: readonly JsonlLine[]): {
	id: string;
	at: string;
} {
	let time = Date.now();
	for (const event of events) time = Math.max(time, Date.parse(event.at) + 1);
	return { id: ulid(time), at: new Date(time).toISOString() };
}
// #endregion FUNC_envelope

// #region FUNC_publishPlan
/** @purpose Materialize every invalidation before the backend publishes the complete history. */
export function publishPlan(plan: WritePlan): readonly JsonlLine[] {
	const events = [...plan.events];
	for (const invalidation of plan.invalidations) {
		events.push({ ...envelope(events), op: "invalidate", ...invalidation });
	}
	debug("Publication prepared", {
		event: "prepared",
		changed: plan.changed,
		invalidations: plan.invalidations.length,
	});
	return events;
}
// #endregion FUNC_publishPlan

// #region FUNC_nodePlan
/**
 * @purpose Refuse stale writer output before it enters the durable history.
 * @invariants Compare the exact copied input under the backend lock. Empty input produces no event.
 * @invariants The result range, child ids, revision, and dates match the current input.
 * @invariants Catalog publication requires the resolved profile scopes. No model call occurs under the lock.
 * @invariants A node event under a catalog scope validates against the catalog tree of its profile. A node above catalog leaves lives in the catalog scope.
 */
export function nodePlan(
	events: readonly JsonlLine[],
	input: BuildInput,
	node: Omit<NodeEvent, "id" | "at">,
	profiles: ProfileScopes,
): WritePlan | Extract<NodeAppendResult, { ok: false }> {
	if (input.children.every((child) => child === null))
		return { ok: false, reason: "empty_children" };
	const projection = project(events);
	const tree = isCatalogKey(node.scope)
		? catalogTree(
				projection,
				node.scope.slice("__catalog__:".length),
				profiles.get(node.scope.slice("__catalog__:".length)) ?? [],
			)
		: scopeTree(projection, node.scope);
	if (!inputUnchanged(tree, input)) {
		debug("Node rejected", { event: "input_changed", scope: node.scope });
		return { ok: false, reason: "input_changed" };
	}
	const children = input.children.filter((child) => child !== null);
	const first = children[0];
	const last = children[children.length - 1];
	if (!first || !last) return { ok: false, reason: "empty_children" };
	const half = 2 ** (input.range.level - 1);
	const inputRev = maxOrder(
		rev(tree, { start: input.range.start, level: input.range.level - 1 }),
		rev(tree, {
			start: input.range.start + half,
			level: input.range.level - 1,
		}),
	);
	if (
		node.start !== input.range.start ||
		node.level !== input.range.level ||
		node.child_a !== (input.children[0]?.id ?? null) ||
		node.child_b !== (input.children[1]?.id ?? null) ||
		node.input_rev !== inputRev ||
		node.ts_from !== (first.kind === "record" ? first.ts : first.ts_from) ||
		node.ts_to !== (last.kind === "record" ? last.ts : last.ts_to) ||
		("proposed" in node && node.proposed)
	)
		throw new MemlensError(
			"Data",
			"A node result differs from its build input.",
		);
	return prepareAppend(events, node, envelope(events), profiles);
}
// #endregion FUNC_nodePlan

// #region FUNC_encodeProjection
/** @purpose Preserve projection maps and sets without a log scan on a later read. */
export function encodeProjection(projection: Projection): string {
	return JSON.stringify(projection, (_key, value) =>
		value instanceof Map
			? { map: [...value] }
			: value instanceof Set
				? { set: [...value] }
				: value,
	);
}
// #endregion FUNC_encodeProjection

// #region FUNC_decodeProjection
/** @purpose Restore the persisted snapshot without a change to its cursor or node state. */
export function decodeProjection(text: string): Projection {
	const projection = JSON.parse(text, (_key, value) =>
		value && typeof value === "object" && Object.keys(value).length === 1
			? Array.isArray(value.map)
				? new Map(value.map)
				: Array.isArray(value.set)
					? new Set(value.set)
					: value
			: value,
	) as Projection;
	if (
		projection.version !== 1 ||
		!(projection.records instanceof Map) ||
		!(projection.byScope instanceof Map) ||
		!(projection.nodes instanceof Map) ||
		!(projection.scopeCounts instanceof Map) ||
		!(projection.invalidated instanceof Set) ||
		!Number.isSafeInteger(projection.cursor) ||
		!Array.isArray(projection.scopeOrder)
	)
		throw new MemlensError("Data", "The projection snapshot is invalid.");
	return projection;
}
// #endregion FUNC_decodeProjection
