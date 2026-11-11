/**
 * Runtime validation of the event log and local append payloads.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Reject malformed events and instructions before they can enter the log, so one bad payload cannot corrupt history or projections.
 * @scope
 *  - Strict import validation of raw and sanitized JSONL lines without value changes.
 *  - Envelope-less local append validation with scope and body normalization.
 *  - Target existence and target type checks across the resolved event union.
 *  - NOT: conflict resolution, projection, storage, clocks, or id generation.
 * @invariants
 *  - A validated import keeps every supplied field value and copies the event and its arrays.
 *  - A local append normalizes the scope and note or amendment body and keeps absent amendment fields absent.
 *  - A local append keeps the ts value of the write as given, and at stays the log time of the envelope.
 *  - A note requires a body with a longform, and no node payload holds longform text.
 *  - A missing target is permitted only for an import.
 *  - Every error is a Data MemlensError with a field name as its message.
 *  - UTC times use YYYY-MM-DDTHH:mm:ss.sssZ so lexical order equals time order.
 *  - review_at is a calendar date in YYYY-MM-DD form, or null.
 *  - Events require id, at, op, and scope. Operations are note, amend, hide, redact, review, dismiss, node, and invalidate.
 *  - Fields belong to their operation. Only notes carry session, turn, and preset. Nodes have no review_at or proposed.
 * @dependencies
 *  USES: events.ts, store.ts, errors.ts, note-body.ts, scope.ts, ulid.ts, order.ts
 * @keywords validation, event, append, target, import, normalize, schema
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";
import type {
	IsoDate,
	IsoTime,
	JsonlLine,
	ScopeKey,
	Ulid,
} from "../types/events.js";
import type { AppendEvent } from "../types/store.js";
import {
	BODY_HARD_LIMIT,
	LONGFORM_LIMIT,
	normalizeBody,
	splitBody,
} from "./note-body.js";
import { makeOrder } from "./order.js";
import {
	CATALOG_PREFIX,
	isCatalogKey,
	normalizeScopeKey,
	validateScopeKey,
} from "./scope.js";
import { isUlid } from "./ulid.js";

const debug = debuglog("memlens:validation");

type Obj = Record<string, unknown>;
type Op = JsonlLine["op"];
type FieldSet = ReadonlySet<string>;

const NOTE_KINDS: FieldSet = new Set([
	"decision",
	"preference",
	"fact",
	"task",
	"note",
]);
const OPS: FieldSet = new Set([
	"note",
	"amend",
	"hide",
	"redact",
	"review",
	"dismiss",
	"node",
	"invalidate",
]);
const PROPOSAL_OPS: FieldSet = new Set(["note", "amend", "hide", "review"]);
const BASE_RAW = ["id", "at", "op", "scope"] as const;
const NOTE_FIELDS = [
	...BASE_RAW,
	"body",
	"kind",
	"ts",
	"review_at",
	"session",
	"turn",
	"preset",
	"longform",
	"refs",
	"supersedes",
	"proposed",
] as const;
const AMEND_FIELDS = [
	...BASE_RAW,
	"target",
	"body",
	"longform",
	"kind",
	"supersedes",
	"proposed",
] as const;
const HIDE_FIELDS = [...BASE_RAW, "target", "reason", "proposed"] as const;
const REDACT_FIELDS = [...BASE_RAW, "target", "reason"] as const;
const REVIEW_FIELDS = [...BASE_RAW, "target", "review_at", "proposed"] as const;
const DISMISS_FIELDS = [...BASE_RAW, "target", "reason"] as const;
const NODE_FIELDS = [
	...BASE_RAW,
	"level",
	"start",
	"child_a",
	"child_b",
	"input_rev",
	"summary",
	"chars",
	"truncated",
	"ts_from",
	"ts_to",
] as const;
const INVALIDATE_FIELDS = [...BASE_RAW, "targets"] as const;

const RAW_FIELDS: Readonly<Record<Op, FieldSet>> = {
	note: new Set(NOTE_FIELDS),
	amend: new Set(AMEND_FIELDS),
	hide: new Set(HIDE_FIELDS),
	redact: new Set(REDACT_FIELDS),
	review: new Set(REVIEW_FIELDS),
	dismiss: new Set(DISMISS_FIELDS),
	node: new Set(NODE_FIELDS),
	invalidate: new Set(INVALIDATE_FIELDS),
};

const SANITIZED_FIELDS: Readonly<Record<"note" | "amend" | "node", FieldSet>> =
	{
		note: new Set([...NOTE_FIELDS, "redacted"]),
		amend: new Set([...AMEND_FIELDS, "redacted"]),
		node: new Set([...NODE_FIELDS, "redacted"]),
	};

const ISO_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function fail(field: string): never {
	debug("Validation failed", { event: "invalid", field });
	throw new MemlensError("Data", field);
}

function asObject(value: unknown): Obj {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		fail("event");
	return value as Obj;
}

function has(record: Obj, field: string): boolean {
	return Object.hasOwn(record, field);
}

function checkFields(record: Obj, allowed: FieldSet): void {
	for (const field of Object.keys(record)) {
		if (!allowed.has(field)) fail("event");
		if (record[field] === undefined) fail(field);
	}
}

function requiredString(record: Obj, field: string): string {
	if (!has(record, field)) fail(field);
	const value = record[field];
	if (typeof value !== "string") fail(field);
	return value;
}

function requiredNumber(record: Obj, field: string): number {
	if (!has(record, field)) fail(field);
	const value = record[field];
	if (typeof value !== "number" || !Number.isFinite(value)) fail(field);
	return value;
}

function parseOp(record: Obj): Op {
	const op = requiredString(record, "op");
	if (!OPS.has(op)) fail("op");
	return op as Op;
}

function isStrictUlid(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length === 26 &&
		value[0] !== undefined &&
		value[0] <= "7" &&
		isUlid(value)
	);
}

function requiredUlid(record: Obj, field: string): Ulid {
	const value = requiredString(record, field);
	if (!isStrictUlid(value)) fail(field);
	return value;
}

function optionalProposed(record: Obj): true | undefined {
	if (!has(record, "proposed")) return undefined;
	if (record.proposed !== true) fail("proposed");
	return true;
}

// #region FUNC_isoTimeMs
/** @purpose Enforce one UTC text format whose lexical order equals chronological order. */
function isoTimeMs(value: unknown): number | null {
	if (typeof value !== "string" || !ISO_TIME_RE.test(value)) return null;
	const time = Date.parse(value);
	return Number.isFinite(time) && new Date(time).toISOString() === value
		? time
		: null;
}
// #endregion FUNC_isoTimeMs

function requiredIsoTime(record: Obj, field: string): IsoTime {
	const value = requiredString(record, field);
	if (isoTimeMs(value) === null) fail(field);
	return value;
}

function isIsoDate(value: unknown): value is IsoDate {
	if (typeof value !== "string") return false;
	if (!ISO_DATE_RE.test(value)) return false;
	return isoTimeMs(`${value}T00:00:00.000Z`) !== null;
}

/** The next review value. A full time passes, and the log keeps older values of the date form. */
function reviewAtOrNull(record: Obj): IsoTime | IsoDate | null {
	if (!has(record, "review_at")) fail("review_at");
	const value = record["review_at"];
	if (value === null) return null;
	if (isIsoDate(value)) return value;
	if (
		typeof value === "string" &&
		ISO_TIME_RE.test(value) &&
		isoTimeMs(value) !== null
	)
		return value;
	fail("review_at");
}

function isCatalogScope(value: string): boolean {
	if (!isCatalogKey(value as ScopeKey)) return false;
	const profile = value.slice(CATALOG_PREFIX.length);
	return profile.length > 0 && validateScopeKey(`profile:${profile}`);
}

function scopeForOp(op: Op): boolean {
	return op === "node" || op === "invalidate";
}

function requiredScope(record: Obj, allowCatalog: boolean): ScopeKey {
	const value = requiredString(record, "scope");
	if (isCatalogKey(value as ScopeKey)) {
		if (!allowCatalog || !isCatalogScope(value)) fail("scope");
	} else if (!validateScopeKey(value)) {
		fail("scope");
	}
	return value as ScopeKey;
}

function stringArray(
	record: Obj,
	field: string,
): readonly string[] | undefined {
	if (!has(record, field)) return undefined;
	const value = record[field];
	if (!Array.isArray(value)) fail(field);
	const result: string[] = [];
	for (const item of value) {
		if (typeof item !== "string") fail(field);
		result.push(item);
	}
	return result;
}

function ulidArray(record: Obj, field: string): readonly Ulid[] | undefined {
	if (!has(record, field)) return undefined;
	const value = record[field];
	if (!Array.isArray(value)) fail(field);
	const result: Ulid[] = [];
	for (const item of value) {
		if (!isStrictUlid(item)) fail(field);
		result.push(item);
	}
	return result;
}

// #region FUNC_parseNotePayload
/**
 * @purpose Keep note leaves within content limits and preserve their source metadata.
 * @invariants Raw notes require non-empty body, kind, ts, review_at, session, turn, and preset. Kind is decision, preference, fact, task, or note.
 * @invariants Notes permit optional longform, refs, supersedes, and proposed true.
 * @invariants Sanitized notes require empty body and null longform. Body and longform limits also apply to imports.
 */
function parseNotePayload(record: Obj, sanitized: boolean): Obj {
	const body = requiredString(record, "body");
	if (sanitized) {
		if (body !== "") fail("body");
	} else if (body.length > BODY_HARD_LIMIT || body.trim().length === 0) {
		fail("body");
	}

	let longform: string | null;
	if (sanitized) {
		if (!has(record, "longform") || record.longform !== null) fail("longform");
		longform = null;
	} else if (has(record, "longform")) {
		const value = requiredString(record, "longform");
		if (value.length > LONGFORM_LIMIT) fail("longform");
		longform = value;
	} else {
		longform = null;
	}

	const kind = requiredString(record, "kind");
	if (!NOTE_KINDS.has(kind)) fail("kind");
	const ts = requiredIsoTime(record, "ts");
	const reviewAt = reviewAtOrNull(record);
	const session = requiredString(record, "session");
	const turn = requiredString(record, "turn");
	const preset = requiredString(record, "preset");
	const proposed = optionalProposed(record);
	const refs = stringArray(record, "refs");
	const supersedes = ulidArray(record, "supersedes");

	const result: Obj = {
		body,
		kind,
		ts,
		review_at: reviewAt,
		session,
		turn,
		preset,
	};
	if (proposed !== undefined) result.proposed = true;
	if (longform !== null || sanitized || has(record, "longform"))
		result.longform = longform;
	if (refs !== undefined) result.refs = refs;
	if (supersedes !== undefined) result.supersedes = supersedes;
	return result;
}

// #endregion FUNC_parseNotePayload

// #region FUNC_parseAmendPayload
/**
 * @purpose Validate edits without replacing absent content fields.
 * @invariants Present raw fields satisfy content limits. Sanitized fields contain empty body or null longform.
 * @invariants An edit permits optional kind and supersedes. A kind is one of the five kinds. A supersedes list names no target of the edit.
 * @invariants Scope-only edit validation requires the current projection and belongs to the write module.
 */
function parseAmendPayload(record: Obj, sanitized: boolean): Obj {
	const target = requiredUlid(record, "target");
	const result: Obj = { target };
	if (has(record, "body")) {
		const body = requiredString(record, "body");
		if (sanitized) {
			if (body !== "") fail("body");
		} else if (body.length > BODY_HARD_LIMIT || body.trim().length === 0) {
			fail("body");
		}
		result.body = body;
	}
	if (has(record, "longform")) {
		if (sanitized) {
			if (record.longform !== null) fail("longform");
			result.longform = null;
		} else {
			const longform = requiredString(record, "longform");
			if (longform.length > LONGFORM_LIMIT) fail("longform");
			result.longform = longform;
		}
	}
	if (has(record, "kind")) {
		const kind = requiredString(record, "kind");
		if (!NOTE_KINDS.has(kind)) fail("kind");
		result.kind = kind;
	}
	if (has(record, "supersedes")) {
		const supersedes = ulidArray(record, "supersedes");
		if (supersedes === undefined || supersedes.length === 0) fail("supersedes");
		if (supersedes.includes(target)) fail("supersedes");
		result.supersedes = supersedes;
	}
	const proposed = optionalProposed(record);
	if (proposed !== undefined) result.proposed = true;
	return result;
}

// #endregion FUNC_parseAmendPayload

function parseHidePayload(record: Obj): Obj {
	const target = requiredUlid(record, "target");
	const reason = requiredString(record, "reason");
	const proposed = optionalProposed(record);
	const result: Obj = { target, reason };
	if (proposed !== undefined) result.proposed = true;
	return result;
}

function parseRedactPayload(record: Obj): Obj {
	return {
		target: requiredUlid(record, "target"),
		reason: requiredString(record, "reason"),
	};
}

function parseReviewPayload(record: Obj): Obj {
	const target = requiredUlid(record, "target");
	const reviewAt = reviewAtOrNull(record);
	const proposed = optionalProposed(record);
	const result: Obj = { target, review_at: reviewAt };
	if (proposed !== undefined) result.proposed = true;
	return result;
}

function parseDismissPayload(record: Obj): Obj {
	return {
		target: requiredUlid(record, "target"),
		reason: requiredString(record, "reason"),
	};
}

function parseOrderOrNull(record: Obj): string | null {
	if (!has(record, "input_rev")) fail("input_rev");
	const value = record.input_rev;
	if (value === null) return null;
	if (typeof value !== "string") fail("input_rev");
	const separator = value.lastIndexOf("|");
	if (separator < 0) fail("input_rev");
	const at = value.slice(0, separator);
	const id = value.slice(separator + 1);
	if (isoTimeMs(at) === null || !isStrictUlid(id)) fail("input_rev");
	if (makeOrder(at, id) !== value) fail("input_rev");
	return value;
}

function childOrNull(record: Obj, field: string): Ulid | null {
	if (!has(record, field)) fail(field);
	const value = record[field];
	if (value === null) return null;
	if (!isStrictUlid(value)) fail(field);
	return value;
}

// #region FUNC_parseNodePayload
/**
 * @purpose Keep summary candidates within valid geometry and content limits.
 * @invariants Positive integer levels and starts define safe integer ranges. Start is a multiple of 2^level. Child ids and revisions retain their structure.
 * @invariants Summary length equals chars and does not exceed 640. Sanitized summaries are empty. The date range is ordered.
 */
function parseNodePayload(record: Obj, sanitized: boolean): Obj {
	const level = requiredNumber(record, "level");
	if (!Number.isSafeInteger(level) || level < 1) fail("level");
	const start = requiredNumber(record, "start");
	if (!Number.isSafeInteger(start) || start < 0) fail("start");
	const size = 2 ** level;
	if (!Number.isSafeInteger(size) || size <= 0) fail("level");
	if (start % size !== 0) fail("start");
	const end = start + size - 1;
	if (!Number.isSafeInteger(end)) fail("start");

	const childA = childOrNull(record, "child_a");
	const childB = childOrNull(record, "child_b");
	const inputRev = parseOrderOrNull(record);
	const summary = requiredString(record, "summary");
	if (sanitized && summary !== "") fail("summary");
	if (summary.length > 640) fail("summary");
	const chars = requiredNumber(record, "chars");
	if (chars !== summary.length) fail("chars");
	if (!has(record, "truncated") || typeof record.truncated !== "boolean")
		fail("truncated");
	const truncated = record.truncated;
	const tsFrom = requiredIsoTime(record, "ts_from");
	const tsTo = requiredIsoTime(record, "ts_to");
	if ((isoTimeMs(tsFrom) ?? 0) > (isoTimeMs(tsTo) ?? 0)) fail("ts_from");

	return {
		level,
		start,
		child_a: childA,
		child_b: childB,
		input_rev: inputRev,
		summary,
		chars,
		truncated,
		ts_from: tsFrom,
		ts_to: tsTo,
	};
}

// #endregion FUNC_parseNodePayload

function parseInvalidatePayload(record: Obj): Obj {
	if (!has(record, "targets")) fail("targets");
	const value = record.targets;
	if (!Array.isArray(value) || value.length === 0) fail("targets");
	const targets: Ulid[] = [];
	const seen = new Set<string>();
	for (const item of value) {
		if (!isStrictUlid(item)) fail("targets");
		if (seen.has(item)) fail("targets");
		seen.add(item);
		targets.push(item);
	}
	return { targets };
}

function parsePayload(record: Obj, op: Op, sanitized: boolean): Obj {
	switch (op) {
		case "note":
			return parseNotePayload(record, sanitized);
		case "amend":
			return parseAmendPayload(record, sanitized);
		case "hide":
			return parseHidePayload(record);
		case "redact":
			return parseRedactPayload(record);
		case "review":
			return parseReviewPayload(record);
		case "dismiss":
			return parseDismissPayload(record);
		case "node":
			return parseNodePayload(record, sanitized);
		case "invalidate":
			return parseInvalidatePayload(record);
	}
}

function parseEnvelope(record: Obj, op: Op): Obj {
	const id = requiredUlid(record, "id");
	const at = requiredIsoTime(record, "at");
	const scope = requiredScope(record, scopeForOp(op));
	return { id, at, scope };
}

function fieldSetFor(op: Op, sanitized: boolean): FieldSet {
	if (sanitized)
		return op === "note" || op === "amend" || op === "node"
			? SANITIZED_FIELDS[op]
			: fail("redacted");
	return RAW_FIELDS[op];
}

function appendFields(op: Op): FieldSet {
	const result = new Set(RAW_FIELDS[op]);
	result.delete("id");
	result.delete("at");
	return result;
}

// #region FUNC_normalizedAppendRecord
/**
 * @purpose Prepare consistent local text without losing overflow or absent amendment fields.
 * @invariants Copy the payload, lowercase scope, and normalize present body text. Overflow precedes the supplied longform.
 * @invariants An amendment without body preserves absent content fields. Overflow above the longform limit fails the write.
 */
function normalizedAppendRecord(record: Obj, op: Op): Obj {
	const scope = normalizeScopeKey(requiredString(record, "scope"));
	const result: Obj = { ...record, scope };
	if (op !== "note" && op !== "amend") return result;

	if (op === "amend" && !has(record, "body")) return result;
	const body = normalizeBody(requiredString(record, "body"));
	if (body.length === 0) fail("body");
	const hasLongform = has(record, "longform");
	const existing = hasLongform ? requiredString(record, "longform") : null;
	let split: { body: string; longform: string | null };
	try {
		split = splitBody(body, existing);
	} catch {
		fail("longform");
	}
	result.body = split.body;
	if (split.longform !== null || hasLongform) result.longform = split.longform;
	else delete result.longform;
	return result;
}

// #endregion FUNC_normalizedAppendRecord

function isProposedPermitted(event: JsonlLine): boolean {
	return (
		"proposed" in event && event.proposed === true && PROPOSAL_OPS.has(event.op)
	);
}

function isOrdinaryNote(event: JsonlLine): boolean {
	return (
		event.op === "note" && !("proposed" in event && event.proposed === true)
	);
}

function knownTarget(
	byId: ReadonlyMap<string, JsonlLine>,
	id: Ulid,
	field: string,
	allowMissing: boolean,
): JsonlLine | null {
	const target = byId.get(id);
	if (target !== undefined) return target;
	if (allowMissing) return null;
	fail(field);
}

// #region FUNC_validateEvent
/**
 * @purpose Check one imported JSONL line and return a copied value that the caller cannot mutate through the input.
 * @requires The value has the exact fields of one raw or sanitized event.
 * @invariants Keep every supplied value. Copy the event object and its arrays. Normalize no field.
 * @param value - The unknown value to check.
 * @returns The validated line.
 */
export function validateEvent(value: unknown): JsonlLine {
	const record = asObject(value);
	const op = parseOp(record);
	const sanitized = has(record, "redacted");
	if (sanitized && record.redacted !== true) fail("redacted");
	checkFields(record, fieldSetFor(op, sanitized));
	const envelope = parseEnvelope(record, op);
	const payload = parsePayload(record, op, sanitized);
	const result: Obj = { ...envelope, op, ...payload };
	if (sanitized) result.redacted = true;
	debug("Event validated", { event: "valid", op, sanitized });
	return result as unknown as JsonlLine;
}
// #endregion FUNC_validateEvent

// #region FUNC_normalizeAppend
/**
 * @purpose Check one local append payload and return the normalized payload for the store envelope.
 * @requires The payload has no id, at, or redacted field.
 * @invariants Lowercase scope before grammar validation. Normalize the body and move body overflow into the longform.
 * @invariants Keep absent amendment body and longform fields absent.
 * @param value - The unknown append payload.
 * @returns The normalized append payload.
 */
export function normalizeAppend(value: unknown): AppendEvent {
	const record = asObject(value);
	const op = parseOp(record);
	checkFields(record, appendFields(op));
	const normalized = normalizedAppendRecord(record, op);
	const scope = requiredScope(normalized, scopeForOp(op));
	const payload = parsePayload(normalized, op, false);
	const result: Obj = { op, scope, ...payload };
	debug("Append normalized", { event: "valid", op });
	return result as unknown as AppendEvent;
}
// #endregion FUNC_normalizeAppend

// #region FUNC_validateTargets
/**
 * @purpose Check that every event target names an event of the permitted operation.
 * @requires The events have passed structural validation.
 * @invariants A local write needs every target. An import can omit a target.
 * @invariants Amend, hide, redact, review, and supersedes target source notes. An amendment carries no target of its own id. Dismiss targets a proposed operation and carries a reason.
 * @invariants A node has no self edge. Its children name ordinary notes or nodes.
 * @param events - The resolved event union.
 * @param allowMissing - True for an import and false for a local write.
 */
export function validateTargets(
	events: readonly JsonlLine[],
	allowMissing = false,
): void {
	const byId = new Map<string, JsonlLine>();
	for (const event of events) {
		if (!byId.has(event.id)) byId.set(event.id, event);
	}
	debug("Target validation start", {
		event: "start",
		events: events.length,
		allowMissing,
	});

	for (const event of events) {
		switch (event.op) {
			case "amend": {
				const target = knownTarget(byId, event.target, "target", allowMissing);
				if (target !== null && !isOrdinaryNote(target)) fail("target");
				for (const id of event.supersedes ?? []) {
					const link = knownTarget(byId, id, "supersedes", allowMissing);
					if (link !== null && !isOrdinaryNote(link)) fail("supersedes");
				}
				break;
			}
			case "hide":
			case "redact":
			case "review": {
				const target = knownTarget(byId, event.target, "target", allowMissing);
				if (target !== null && !isOrdinaryNote(target)) fail("target");
				break;
			}
			case "dismiss": {
				const target = knownTarget(byId, event.target, "target", allowMissing);
				if (target !== null && !isProposedPermitted(target)) fail("target");
				break;
			}
			case "note": {
				if (event.supersedes === undefined) break;
				for (const id of event.supersedes) {
					const target = knownTarget(byId, id, "supersedes", allowMissing);
					if (target !== null && !isOrdinaryNote(target)) fail("supersedes");
				}
				break;
			}
			case "invalidate": {
				for (const id of event.targets) {
					const target = knownTarget(byId, id, "targets", allowMissing);
					if (target !== null && target.op !== "node") fail("targets");
				}
				break;
			}
			case "node": {
				for (const [field, id] of [
					["child_a", event.child_a],
					["child_b", event.child_b],
				] as const) {
					if (id === null) continue;
					if (id === event.id) fail(field);
					const target = knownTarget(byId, id, field, allowMissing);
					if (
						target !== null &&
						!isOrdinaryNote(target) &&
						target.op !== "node"
					)
						fail(field);
				}
				break;
			}
		}
	}

	debug("Target validation done", { event: "valid", events: events.length });
}
// #endregion FUNC_validateTargets
