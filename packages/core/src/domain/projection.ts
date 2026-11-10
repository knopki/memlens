/**
 * #region moduleContract
 * @modulecontract
 * @purpose Derive current records and stable scope positions from the canonical event history.
 * @scope Two-pass replay, node selection, and tree inputs. No file access or model calls.
 * @invariants Input events stay unchanged. Proposed operations change no record and allocate no position.
 * @invariants Record states are live, hidden, and deleted. No operation restores a record to live.
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";
import type { JsonlLine, ScopeKey, Ulid } from "../types/events.js";
import {
	PROJECTION_VERSION,
	type Projection,
	type ProjectionRecord,
	type ScopeCount,
} from "../types/projection.js";
import type { Order, Tree, TreeNode } from "../types/tree.js";
import { makeOrder, maxOrder } from "./order.js";
import { redactionClosure } from "./sanitization.js";
import { catalogKey } from "./scope.js";

const debug = debuglog("memlens:projection");
type MutableRecord = {
	-readonly [Key in keyof ProjectionRecord]: ProjectionRecord[Key];
};
type Entry = { id: Ulid; scope: ScopeKey; order: Order };
type NoteLine = Extract<JsonlLine, { op: "note" }>;
type NodeLine = Extract<JsonlLine, { op: "node" }>;
type AmendLine = Extract<JsonlLine, { op: "amend" }>;
type RecordOperation = Extract<
	JsonlLine,
	{ op: "amend" | "hide" | "redact" | "review" }
>;
type ReplayState = {
	records: Map<Ulid, MutableRecord>;
	invalidated: Set<Ulid>;
	entries: Entry[];
	latestEntry: Map<Ulid, Entry>;
	nodes: Map<ScopeKey, Map<string, TreeNode>>;
};

function touch(record: MutableRecord, order: Order): void {
	record.order = maxOrder(record.order, order) ?? order;
}

/** @purpose Mark erased records deleted with content_cleared, an empty body, and null longform. */
function clear(record: MutableRecord): void {
	record.state = "deleted";
	record.content_cleared = true;
	record.body = "";
	record.longform = null;
}

/**
 * @purpose Initialize a live record from each source note and copy its payload fields.
 * @invariants recorded_at copies at. review_at copies the next review date.
 * @invariants Absent longform becomes null. Absent refs and supersedes become empty arrays.
 */
function recordFromNote(event: NoteLine): MutableRecord {
	return {
		id: event.id,
		scope: event.scope,
		pos: -1,
		order: makeOrder(event.at, event.id),
		state: "live",
		body: event.body,
		kind: event.kind,
		ts: event.ts,
		review_at: event.review_at,
		recorded_at: event.at,
		longform: event.longform ?? null,
		refs: [...(event.refs ?? [])],
		supersedes: [...(event.supersedes ?? [])],
		superseded_by: null,
		content_cleared: false,
		session: event.session,
		turn: event.turn,
		preset: event.preset,
	};
}

// #region FUNC_collectRecords
/**
 * @purpose Create all records and collect invalidations before any operation resolves its targets.
 * @invariants Include provisional targets supplied by a write plan before node selection.
 */
function collectRecords(
	events: readonly JsonlLine[],
	invalidated: readonly Ulid[],
): ReplayState {
	const state: ReplayState = {
		records: new Map(),
		invalidated: new Set(invalidated),
		entries: [],
		latestEntry: new Map(),
		nodes: new Map(),
	};
	for (const event of events) {
		if (event.op === "invalidate") {
			for (const id of event.targets) state.invalidated.add(id);
		}
		if (event.op !== "note" || event.proposed) continue;
		state.records.set(event.id, recordFromNote(event));
		const entry = {
			id: event.id,
			scope: event.scope,
			order: makeOrder(event.at, event.id),
		};
		state.entries.push(entry);
		state.latestEntry.set(event.id, entry);
	}
	debug("Records ready", {
		event: "pass_one",
		records: state.records.size,
		invalidated: state.invalidated.size,
	});
	return state;
}
// #endregion FUNC_collectRecords

/**
 * @purpose Select the latest surviving candidate for each scope, level, and start.
 * @invariants Invalidated and sanitized nodes never become candidates. A range without a surviving candidate has no current node.
 */
function selectNode(state: ReplayState, event: NodeLine, order: Order): void {
	if (event.redacted || state.invalidated.has(event.id)) {
		debug("Node excluded", {
			event: "node_excluded",
			id: event.id,
			redacted: event.redacted === true,
			invalidated: state.invalidated.has(event.id),
		});
		return;
	}
	let scopeNodes = state.nodes.get(event.scope);
	if (!scopeNodes) {
		scopeNodes = new Map();
		state.nodes.set(event.scope, scopeNodes);
	}
	scopeNodes.set(`${event.level}:${event.start}`, {
		id: event.id,
		order,
		range: { level: event.level, start: event.start },
		child_a: event.child_a,
		child_b: event.child_b,
		input_rev: event.input_rev,
		summary: event.summary,
		chars: event.chars,
		truncated: event.truncated,
		ts_from: event.ts_from,
		ts_to: event.ts_to,
	});
	debug("Node selected", {
		event: "node_selected",
		id: event.id,
		scope: event.scope,
		level: event.level,
		start: event.start,
	});
}

// #region FUNC_applySupersedes
/**
 * @purpose Apply supersedes only when the source note is live at its replay step.
 * @invariants Forward targets participate. Targets become hidden unless already deleted. The first superseded_by value stays.
 * @invariants Later changes to the source never cancel its supersedes. Cross-scope targets raise CrossScopeSupersede.
 */
function applySupersedes(
	records: ReplayState["records"],
	record: MutableRecord,
	order: Order,
): void {
	if (record.state !== "live") return;
	for (const id of record.supersedes) {
		const target = records.get(id);
		if (!target) continue;
		if (target.scope !== record.scope) {
			debug("Supersede rejected", {
				event: "cross_scope",
				id: record.id,
				target: id,
			});
			throw new MemlensError(
				"CrossScopeSupersede",
				"A supersede target belongs to another scope.",
			);
		}
		if (target.state === "live") target.state = "hidden";
		target.superseded_by ??= record.id;
		touch(target, order);
	}
}
// #endregion FUNC_applySupersedes

/**
 * @purpose Apply present content fields or transfer a record without changing its source id.
 * @invariants An edit within one scope keeps its position. Each transfer creates a new destination entry.
 * @invariants Absent content fields preserve current values. Erased records can transfer but cannot regain content.
 */
function applyAmendment(
	state: ReplayState,
	record: MutableRecord,
	event: AmendLine,
	order: Order,
): void {
	if (record.scope !== event.scope) {
		const entry = { id: record.id, scope: event.scope, order };
		state.entries.push(entry);
		state.latestEntry.set(record.id, entry);
		debug("Record transferred", {
			event: "transfer",
			id: record.id,
			from: record.scope,
			to: event.scope,
		});
		record.scope = event.scope;
	}
	if (event.redacted) clear(record);
	if (!record.content_cleared) {
		if (event.body !== undefined) record.body = event.body;
		if (event.longform !== undefined) record.longform = event.longform;
	}
}

/**
 * @purpose Apply operations to their source records and retain each record's latest mutation order.
 * @invariants Hide preserves content and cannot lower deleted state. Review replaces review_at.
 */
function applyRecordOperation(
	state: ReplayState,
	event: RecordOperation,
	order: Order,
): void {
	const record = state.records.get(event.target);
	if (!record) {
		debug("Target absent", {
			event: "target_absent",
			id: event.id,
			target: event.target,
		});
		return;
	}
	touch(record, order);
	switch (event.op) {
		case "hide":
			if (record.state === "live") record.state = "hidden";
			break;
		case "redact":
			clear(record);
			break;
		case "review":
			record.review_at = event.review_at;
			break;
		case "amend":
			applyAmendment(state, record, event, order);
			break;
	}
	debug("Record updated", {
		event: "operation_applied",
		op: event.op,
		id: event.id,
		target: event.target,
		state: record.state,
		content_cleared: record.content_cleared,
	});
}

// #region FUNC_applyOperations
/**
 * @purpose Apply canonical operations after every source note exists.
 * @invariants Each note applies supersedes once, before its sanitized form clears the source record.
 * @invariants Redact and sanitized note or amendment evidence mark records deleted with content_cleared. Dismiss changes no record.
 */
function applyOperations(
	state: ReplayState,
	events: readonly JsonlLine[],
): void {
	for (const event of events) {
		if ("proposed" in event && event.proposed) continue;
		const order = makeOrder(event.at, event.id);
		switch (event.op) {
			case "node":
				selectNode(state, event, order);
				break;
			case "invalidate":
			case "dismiss":
				break;
			case "note": {
				const record = state.records.get(event.id);
				if (!record) break;
				applySupersedes(state.records, record, order);
				if (event.redacted) clear(record);
				break;
			}
			default:
				applyRecordOperation(state, event, order);
		}
	}
}
// #endregion FUNC_applyOperations

// #region FUNC_assignPositions
/**
 * @purpose Derive local positions from real scope entries in canonical event order, without event position fields.
 * @invariants Creation and transfer each consume one slot. Only the latest entry holds the record. Earlier slots remain empty.
 * @invariants The first real entry introduces a scope. Empty scopes retain their historical order.
 */
function assignPositions(
	state: ReplayState,
): Pick<Projection, "scopeCounts" | "scopeOrder"> {
	const scopeCounts = new Map<ScopeKey, ScopeCount>();
	const scopeOrder: ScopeKey[] = [];
	state.entries.sort((a, b) =>
		a.order < b.order ? -1 : a.order > b.order ? 1 : 0,
	);
	for (const entry of state.entries) {
		let count = scopeCounts.get(entry.scope);
		if (!count) {
			count = { scope: entry.scope, total: 0, live: 0 };
			scopeOrder.push(entry.scope);
		}
		if (state.latestEntry.get(entry.id) === entry) {
			const record = state.records.get(entry.id);
			if (record) record.pos = count.total;
		}
		scopeCounts.set(entry.scope, { ...count, total: count.total + 1 });
	}
	for (const record of state.records.values()) {
		const count = scopeCounts.get(record.scope);
		if (count && record.state === "live") {
			scopeCounts.set(record.scope, { ...count, live: count.live + 1 });
		}
	}
	return { scopeCounts, scopeOrder };
}
// #endregion FUNC_assignPositions

function groupRecords(
	records: ReplayState["records"],
	scopes: readonly ScopeKey[],
): Projection["byScope"] {
	const byScope = new Map<ScopeKey, ProjectionRecord[]>();
	for (const scope of scopes) byScope.set(scope, []);
	for (const record of records.values())
		byScope.get(record.scope)?.push(record);
	for (const scoped of byScope.values()) scoped.sort((a, b) => a.pos - b.pos);
	return byScope;
}

// #region FUNC_project
/**
 * @purpose Derive the same projection from any arrival order of the resolved events.
 * @requires Events have valid fields and unique ids after import conflict resolution.
 * @invariants Replay follows (at, id). Pass one creates records. Pass two applies operations, including targets later in that order.
 * @invariants Additional invalidated ids support a provisional write plan before its event envelopes exist.
 * @invariants The caller must persist provisional invalidations before publication. Candidate selection includes historical fallbacks.
 * @ensures The snapshot holds records, current range nodes, scope counts, and schema version 1. The supplied cursor stays unchanged.
 */
export function project(
	events: readonly JsonlLine[],
	cursor = 0,
	invalidated: readonly Ulid[] = [],
): Projection {
	const ordered = [...redactionClosure(events)].sort((a, b) => {
		const left = makeOrder(a.at, a.id);
		const right = makeOrder(b.at, b.id);
		return left < right ? -1 : left > right ? 1 : 0;
	});
	debug("Replay start", { event: "start", events: ordered.length, cursor });
	const state = collectRecords(ordered, invalidated);
	applyOperations(state, ordered);
	const positions = assignPositions(state);
	const byScope = groupRecords(state.records, positions.scopeOrder);
	debug("Replay complete", {
		event: "complete",
		records: state.records.size,
		scopes: positions.scopeCounts.size,
		cursor,
	});
	return {
		version: PROJECTION_VERSION,
		records: state.records,
		byScope,
		...positions,
		invalidated: state.invalidated,
		cursor,
		nodes: new Map(
			[...state.nodes].map(([scope, ranges]) => [scope, [...ranges.values()]]),
		),
	};
}
// #endregion FUNC_project

// #region FUNC_scopeTree
/** @purpose Supply the tree engine with current records and summary candidates for one scope. */
export function scopeTree(projection: Projection, scope: ScopeKey): Tree {
	const tree: Tree = {
		total: projection.scopeCounts.get(scope)?.total ?? 0,
		notes: (projection.byScope.get(scope) ?? []).map((record) => ({
			id: record.id,
			order: record.order,
			pos: record.pos,
			state: record.state,
			body: record.body,
			longform: record.longform,
			at: record.recorded_at,
			ts: record.ts,
		})),
		nodes: projection.nodes.get(scope) ?? [],
		invalidated: [...projection.invalidated],
	};
	debug("Scope tree ready", {
		event: "scope_tree",
		scope,
		total: tree.total,
		records: tree.notes.length,
	});
	return tree;
}
// #endregion FUNC_scopeTree

// #region FUNC_catalogTree
/**
 * @purpose Assign one catalog position to each visible scope, with its scope tree as the leaf.
 * @invariants Positions follow the first real appearance of each profile scope in canonical event order. Empty scopes keep their positions.
 * @invariants A shared scope has one position in each profile that includes it. The caller supplies the resolved profile scopes.
 */
export function catalogTree(
	projection: Projection,
	profile: string,
	scopes: readonly ScopeKey[],
): Tree {
	const visible = new Set(scopes);
	const selected = projection.scopeOrder.filter((scope) => visible.has(scope));
	const scope_roots = new Map(
		selected.map((scope, pos) => [pos, scopeTree(projection, scope)]),
	);
	const tree: Tree = {
		total: selected.length,
		notes: [],
		scope_roots,
		nodes: projection.nodes.get(catalogKey(profile)) ?? [],
		invalidated: [...projection.invalidated],
	};
	debug("Catalog tree ready", {
		event: "catalog_tree",
		profile,
		scopes: selected.length,
	});
	return tree;
}
// #endregion FUNC_catalogTree
