/**
 * #region moduleContract
 * @purpose Keep publication envelopes and persisted snapshots consistent across both backends.
 * @scope Small publication helpers, the proposal decision, and the expiry composition of a write. No locks, file access, or storage lifecycle.
 * @invariants The backend owns the lock throughout preparation and publication.
 * @invariants Every planned invalidation becomes an event in the same publication as its source change.
 * #endregion moduleContract
 */

import { debuglog, isDeepStrictEqual } from "node:util";
import type { ProfileScopes } from "../domain/invalidation.js";
import { maxOrder } from "../domain/order.js";
import { catalogTree, project, scopeTree } from "../domain/projection.js";
import { isCatalogKey } from "../domain/scope.js";
import { inputUnchanged, rev } from "../domain/tree.js";
import { ulid } from "../domain/ulid.js";
import {
	expiredProposals,
	prepareAppend,
	prepareImport,
	type WritePlan,
} from "../domain/write.js";
import { MemlensError } from "../types/errors.js";
import type { Event, JsonlLine, NodeEvent, ScopeKey } from "../types/events.js";
import type { Projection } from "../types/projection.js";
import type { NodeAppendResult } from "../types/store.js";
import type { BuildInput } from "../types/tree.js";

const debug = debuglog("memlens:publication");

// #region FUNC_envelope
/**
 * @purpose Give a local event a unique identity and a time after the current history.
 * @invariants The at value is the log time, and no later operation changes it.
 */
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
 * @purpose Refuse stale compaction output before it enters the durable history.
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

// #region FUNC_proposalPlan
/**
 * @purpose Prepare one human decision against the current history before atomic publication.
 * @invariants Reject changed, sanitized, or closed proposals. Require visible scopes for the proposal and every affected record.
 * @invariants Approval uses ordinary append validation, deduplication, and a log time after the current history.
 * @invariants The plan contains the ordinary operation and dismissal, or the dismissal alone. Failure changes nothing.
 */
export function proposalPlan(
	events: readonly JsonlLine[],
	proposal: Event,
	accept: boolean,
	scopes: readonly ScopeKey[],
	profiles: ProfileScopes,
): WritePlan {
	if (
		!("proposed" in proposal && proposal.proposed === true) ||
		!isDeepStrictEqual(
			events.find((event) => event.id === proposal.id),
			proposal,
		) ||
		events.some(
			(event) => event.op === "dismiss" && event.target === proposal.id,
		)
	) {
		debug("Proposal rejected", { event: "stale", id: proposal.id });
		throw new MemlensError(
			"Data",
			"The proposal is no longer pending or has changed.",
		);
	}
	const projection = project(events);
	const linked =
		proposal.op === "amend" || proposal.op === "note"
			? (proposal.supersedes ?? [])
			: [];
	const targets = "target" in proposal ? [proposal.target, ...linked] : linked;
	const affected = [
		proposal.scope,
		...(accept ? targets.map((id) => projection.records.get(id)?.scope) : []),
	];
	if (affected.some((scope) => scope === undefined || !scopes.includes(scope)))
		throw new MemlensError(
			"NotAllowed",
			"The proposal affects a scope outside this profile.",
		);
	let next = events;
	if (accept) {
		const { id: _id, at: _at, proposed: _proposed, ...payload } = proposal;
		next = prepareAppend(events, payload, envelope(events), profiles).events;
	}
	next = prepareAppend(
		next,
		{
			op: "dismiss",
			scope: proposal.scope,
			target: proposal.id,
			reason: accept ? "accepted" : "ui dismiss",
		},
		envelope(next),
		profiles,
	).events;
	const plan = prepareImport(events, next, profiles);
	debug("Proposal decided", {
		event: "decision",
		id: proposal.id,
		accept,
		changed: plan.changed,
	});
	return plan;
}
// #endregion FUNC_proposalPlan

// #region FUNC_appendPlan
/**
 * @purpose Prepare one local write and each proposal dismissal it forces, as one plan.
 * @invariants Each expired proposal gains one dismiss event with the reason expired.
 * @invariants The plan keeps the appended event or the duplicate of the caller write. A dismiss
 * changes no record, no index row, and no invalidation.
 * @invariants A store that opens for a write dismisses each proposal past its expiry, and a
 * repeated write adds no second dismiss. The write time is the current clock.
 */
export function appendPlan(
	events: readonly JsonlLine[],
	value: unknown,
	envelope: { readonly id: string; readonly at: string },
	profiles: ProfileScopes = new Map(),
): WritePlan {
	const plan = prepareAppend(events, value, envelope, profiles);
	return withExpiry(plan, profiles);
}
// #endregion FUNC_appendPlan

// #region FUNC_importPlan
/**
 * @purpose Prepare one import and each proposal dismissal it forces, as one plan.
 * @invariants The rules of appendPlan apply. The plan keeps the changed count of the import plus
 * one for each dismissal.
 */
export function importPlan(
	local: readonly JsonlLine[],
	incoming: readonly unknown[],
	profiles: ProfileScopes = new Map(),
): WritePlan {
	return withExpiry(prepareImport(local, incoming, profiles), profiles);
}
// #endregion FUNC_importPlan

// #region FUNC_withExpiry
/**
 * @purpose Fold one dismiss event for each expired proposal into a finished plan.
 * @invariants The caller write keeps its identity. The last projection covers every dismissal.
 * @invariants The current clock gives the write time, so a future event time ages no proposal.
 */
function withExpiry(plan: WritePlan, profiles: ProfileScopes): WritePlan {
	const expired = expiredProposals(plan.events, new Date().toISOString());
	if (!expired.length) return plan;
	let current = plan;
	for (const item of expired)
		current = prepareAppend(
			current.events,
			{
				op: "dismiss",
				scope: item.scope,
				target: item.target,
				reason: "expired",
			},
			envelope(current.events),
			profiles,
		);
	debug("Proposals expired", { event: "proposal_gc", count: expired.length });
	return {
		...current,
		changed: plan.changed + expired.length,
		appended: plan.appended,
		duplicate: plan.duplicate,
	};
}
// #endregion FUNC_withExpiry

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
		projection.version !== 2 ||
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
