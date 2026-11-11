/**
 * #region moduleContract
 * @purpose Prepare complete domain changes before storage publishes any data.
 * @scope Local append normalization, duplicate notes, import merge, and invalidation plans.
 * @invariants No file access, clocks, random ids, or model calls. The caller supplies each event envelope.
 * @invariants Failed preparation changes no input. Generated invalidations require atomic publication with the data.
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";
import type { Event, JsonlLine } from "../types/events.js";
import type { Projection } from "../types/projection.js";
import {
	type InvalidationPlan,
	type ProfileScopes,
	planInvalidation,
} from "./invalidation.js";
import { canonicalJson, mergeEvents } from "./merge.js";
import { BODY_HARD_LIMIT, normalizeBody } from "./note-body.js";
import { project } from "./projection.js";
import { redactionClosure } from "./sanitization.js";
import {
	normalizeAppend,
	validateEvent,
	validateTargets,
} from "./validation.js";

const debug = debuglog("memlens:write");

/** The projection applies planned invalidations before any later read. */
export interface WritePlan extends InvalidationPlan {
	readonly events: readonly JsonlLine[];
	readonly projection: Projection;
	readonly changed: number;
	readonly appended: JsonlLine | null;
	readonly duplicate: JsonlLine | null;
	/** The record ids whose index rows must change with this plan. */
	readonly touched: readonly string[];
}

// #region FUNC_prepareAppend
/**
 * @purpose Validate one local write and return its complete domain state or an existing duplicate.
 * @requires The local history is valid with unique ids. The backend supplies a fresh id and log time.
 * @invariants Normalize scope and body before duplicate comparison. Compare live notes in the same scope by four payload fields.
 * @invariants A present supersedes field bypasses deduplication. Proposals never collapse into ordinary notes.
 * @invariants Require existing valid targets and their current scope. An amendment must change content or transfer to another scope.
 * @invariants A duplicate writes nothing and preserves the original event and state.
 */
export function prepareAppend(
	local: readonly JsonlLine[],
	value: unknown,
	envelope: { readonly id: string; readonly at: string },
	profiles: ProfileScopes = new Map(),
): WritePlan {
	const before = project(local);
	const payload = normalizeAppend(amendmentInput(value, before));
	const event = validateEvent({ ...payload, ...envelope }) as Event;
	if (local.some((item) => item.id === event.id)) {
		throw new MemlensError("Data", "A local event id already exists.");
	}
	requireTargets(event, local);
	validateTargets([...local, event], true);
	validateWriteContext(event, before, local);
	const duplicate = findDuplicate(event, local, before);
	if (duplicate) {
		debug("Duplicate note", { event: "duplicate", id: duplicate.id });
		return {
			events: local,
			projection: before,
			changed: 0,
			appended: null,
			duplicate,
			ranges: [],
			invalidations: [],
			touched: [],
		};
	}
	const events = redactionClosure([...local, event]);
	const plan = planInvalidation(local, events, profiles);
	debug("Append prepared", {
		event: "append",
		id: event.id,
		op: event.op,
		invalidations: plan.invalidations.length,
	});
	return {
		...plan,
		events,
		projection: plannedProjection(events, plan),
		changed: 1,
		appended: events.find((item) => item.id === event.id) ?? null,
		duplicate: null,
		touched: touchedRecords(events, local, (item) => item.id === event.id),
	};
}
// #endregion FUNC_prepareAppend

// #region FUNC_prepareImport
/**
 * @purpose Prepare a validated union with erasure and durable invalidation targets.
 * @invariants Every incoming copy passes validation before merge. Imported nodes start unusable.
 * @invariants Invalidation evidence survives losing copies and missing targets until the backend persists it.
 * @invariants Repeated import changes no event or node state. The count includes new or replaced local ids.
 */
export function prepareImport(
	local: readonly JsonlLine[],
	incoming: readonly unknown[],
	profiles: ProfileScopes = new Map(),
): WritePlan {
	const merged = mergeEvents(local, incoming);
	const changedIds = new Set([...merged.added, ...merged.replaced]);
	const importedNodes = merged.events
		.filter((event) => event.op === "node" && changedIds.has(event.id))
		.map((event) => event.id);
	const plan = planInvalidation(
		local,
		merged.events,
		profiles,
		importedNodes,
		merged.invalidationEvidence,
	);
	const changed = changedIds.size;
	debug("Import prepared", {
		event: "import",
		changed,
		invalidations: plan.invalidations.length,
	});
	return {
		...plan,
		events: merged.events,
		projection: plannedProjection(merged.events, plan),
		changed,
		appended: null,
		duplicate: null,
		touched: touchedRecords(merged.events, local, (item) =>
			changedIds.has(item.id),
		),
	};
}
// #endregion FUNC_prepareImport

/** @purpose Preserve the existing document when only an amended body overflows its limit. */
function amendmentInput(value: unknown, projection: Projection): unknown {
	if (!value || typeof value !== "object" || Array.isArray(value)) return value;
	const input = value as Record<string, unknown>;
	if (
		input.op !== "amend" ||
		typeof input.body !== "string" ||
		Object.hasOwn(input, "longform") ||
		normalizeBody(input.body).length <= BODY_HARD_LIMIT
	)
		return value;
	const record =
		typeof input.target === "string"
			? projection.records.get(input.target)
			: undefined;
	return record?.longform === null || record?.longform === undefined
		? value
		: { ...input, longform: record.longform };
}

// #region FUNC_requireTargets
/** @purpose Refuse absent targets on a local write without rejecting partial imported history. */
function requireTargets(event: Event, local: readonly JsonlLine[]): void {
	const ids = new Set(local.map((item) => item.id));
	const targets =
		event.op === "note"
			? (event.supersedes ?? [])
			: event.op === "amend"
				? [event.target, ...(event.supersedes ?? [])]
				: event.op === "node"
					? [event.child_a, event.child_b].filter(
							(id): id is string => id !== null,
						)
					: event.op === "invalidate"
						? event.targets
						: [event.target];
	for (const target of targets) {
		if (!ids.has(target))
			throw new MemlensError("Data", "A local target does not exist.");
	}
}
// #endregion FUNC_requireTargets

// #region FUNC_validateWriteContext
/**
 * @purpose Check resolved record scopes and scope-only edits against the state under the write lock.
 * @invariants An amendment without body, longform, kind, or supersedes must transfer the target to another scope.
 */
function validateWriteContext(
	event: Event,
	projection: Projection,
	local: readonly JsonlLine[],
): void {
	if (event.op === "note") {
		for (const id of event.supersedes ?? []) {
			if (projection.records.get(id)?.scope !== event.scope)
				throw new MemlensError(
					"CrossScopeSupersede",
					"A supersede target belongs to another scope.",
				);
		}
	} else if (event.op === "amend") {
		for (const id of event.supersedes ?? []) {
			if (projection.records.get(id)?.scope !== event.scope)
				throw new MemlensError(
					"CrossScopeSupersede",
					"A supersede target belongs to another scope.",
				);
		}
		if (
			event.body === undefined &&
			event.longform === undefined &&
			event.kind === undefined &&
			event.supersedes === undefined &&
			projection.records.get(event.target)?.scope === event.scope
		) {
			throw new MemlensError(
				"Data",
				"An amendment must change the content, the scope, the kind, or the supersedes.",
			);
		}
	} else if (
		event.op === "hide" ||
		event.op === "review" ||
		event.op === "redact" ||
		event.op === "dismiss"
	) {
		const targetScope =
			event.op === "dismiss"
				? local.find((item) => item.id === event.target)?.scope
				: projection.records.get(event.target)?.scope;
		if (targetScope !== event.scope)
			throw new MemlensError(
				"Data",
				"A target scope differs from the resolved scope.",
			);
	}
}
// #endregion FUNC_validateWriteContext

// #region FUNC_findDuplicate
/**
 * @purpose Reuse one live note when its normalized payload matches all four comparison fields.
 * @invariants Compare body, longform, kind, and review_at within the same scope. Only live notes match.
 * @invariants A different comparison field or a present supersedes field creates a new note. Proposals bypass this comparison.
 */
function findDuplicate(
	event: Event,
	local: readonly JsonlLine[],
	projection: Projection,
): JsonlLine | null {
	if (
		event.op !== "note" ||
		event.proposed ||
		Object.hasOwn(event, "supersedes")
	)
		return null;
	const record = (projection.byScope.get(event.scope) ?? []).find(
		(record) =>
			record.state === "live" &&
			record.body === event.body &&
			record.longform === (event.longform ?? null) &&
			record.kind === event.kind &&
			record.review_at === event.review_at,
	);
	return record ? (local.find((item) => item.id === record.id) ?? null) : null;
}
// #endregion FUNC_findDuplicate

// #region FUNC_touchedRecords
/**
 * @purpose Name each record whose index row changes with the plan, so the store syncs no extra row.
 * @invariants A changed event of a note touches its record and its supersede targets.
 * A changed amend, hide, redact, or review touches its target. A sanitized copy counts as changed.
 * Unchanged events touch nothing, and node and invalidate events own no record row.
 */
function touchedRecords(
	events: readonly JsonlLine[],
	local: readonly JsonlLine[],
	fresh: (event: JsonlLine) => boolean,
): readonly string[] {
	const previous = new Map(local.map((event) => [event.id, event]));
	const ids = new Set<string>();
	for (const event of events) {
		const old = previous.get(event.id);
		const changed =
			fresh(event) ||
			old === undefined ||
			canonicalJson(old) !== canonicalJson(event);
		if (!changed) continue;
		if (event.op === "note") {
			ids.add(event.id);
			for (const target of event.supersedes ?? []) ids.add(target);
		} else if (event.op === "amend") {
			ids.add(event.target);
			for (const target of event.supersedes ?? []) ids.add(target);
		} else if (
			event.op === "hide" ||
			event.op === "redact" ||
			event.op === "review"
		)
			ids.add(event.target);
	}
	debug("Touched records", { event: "touched", count: ids.size });
	return [...ids];
}
// #endregion FUNC_touchedRecords

// #region FUNC_plannedProjection
/**
 * @purpose Expose the post-publication state before invalidation envelopes exist.
 * @invariants Storage must persist every planned invalidation before it exposes this snapshot.
 */
function plannedProjection(
	events: readonly JsonlLine[],
	plan: InvalidationPlan,
): Projection {
	return project(
		events,
		0,
		plan.invalidations.flatMap((item) => item.targets),
	);
}
// #endregion FUNC_plannedProjection
