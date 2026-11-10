/**
 * #region moduleContract
 * @purpose Preserve usable branches while preventing summaries from hiding changed input.
 * @scope Pure comparison of resolved histories, scope paths, and configured catalog paths.
 * @invariants Compare exact record inputs and both old and new positions. Never rely on maximum revision alone.
 * @invariants Include historical candidates on affected paths. Do not invalidate sibling branches.
 * @invariants Return sorted unique targets grouped by node scope. Generate no ids or times.
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { JsonlLine, ScopeKey, Ulid } from "../types/events.js";
import type { Projection } from "../types/projection.js";
import type { Range, TreeNode } from "../types/tree.js";
import { canonicalJson, type MergeResult } from "./merge.js";
import { project } from "./projection.js";
import { catalogKey } from "./scope.js";

const debug = debuglog("memlens:invalidation");

/** The caller resolves each profile filter against all known scopes. */
export type ProfileScopes = ReadonlyMap<string, readonly ScopeKey[]>;

/** Affected ranges include ranges whose summaries have no current candidate. */
export interface InvalidationPlan {
	readonly ranges: readonly (Range & { readonly scope: ScopeKey })[];
	readonly invalidations: readonly {
		readonly scope: ScopeKey;
		readonly targets: readonly Ulid[];
	}[];
}

type NodeLine = Extract<JsonlLine, { op: "node" }>;
type AffectedRange = Range & { readonly scope: ScopeKey };
type LeafInput = {
	readonly scope: ScopeKey;
	readonly pos: number;
	readonly input: string;
};
type SelectedNode = {
	readonly scope: ScopeKey;
	readonly range: Range;
	readonly input: string;
};

const compareText = (left: string, right: string): number =>
	left < right ? -1 : left > right ? 1 : 0;
const rangeKey = (scope: ScopeKey, range: Range): string =>
	`${scope}\u0000${range.start}\u0000${range.level}`;
const leafKey = (scope: ScopeKey, pos: number): string =>
	`${scope}\u0000${pos}`;
const rootLevel = (total: number): number =>
	total > 0 ? Math.max(1, Math.ceil(Math.log2(total))) : 0;

// #region FUNC_collectLiveInputs
/**
 * @purpose Copy the exact values that the tree reads from each live record position.
 * @invariants Hidden and deleted records are absent. A live-hidden change is visible as a missing position.
 */
function collectLiveInputs(projection: Projection): Map<string, LeafInput> {
	const result = new Map<string, LeafInput>();
	for (const record of projection.records.values()) {
		if (record.state !== "live") continue;
		result.set(leafKey(record.scope, record.pos), {
			scope: record.scope,
			pos: record.pos,
			input: canonicalJson({
				id: record.id,
				pos: record.pos,
				scope: record.scope,
				state: record.state,
				body: record.body,
				longform: record.longform,
				ts: record.ts,
				recorded_at: record.recorded_at,
				order: record.order,
			}),
		});
	}
	return result;
}
// #endregion FUNC_collectLiveInputs

// #region FUNC_collectSelectedNodes
/** @purpose Copy the current candidate fields of each scope range for exact comparison. */
function collectSelectedNodes(
	projection: Projection,
): Map<string, SelectedNode> {
	const result = new Map<string, SelectedNode>();
	for (const [scope, nodes] of projection.nodes) {
		for (const node of nodes)
			result.set(rangeKey(scope, node.range), selectedNode(scope, node));
	}
	return result;
}
// #endregion FUNC_collectSelectedNodes

function selectedNode(scope: ScopeKey, node: TreeNode): SelectedNode {
	return {
		scope,
		range: node.range,
		input: canonicalJson({
			id: node.id,
			order: node.order,
			range: node.range,
			child_a: node.child_a,
			child_b: node.child_b,
			input_rev: node.input_rev,
			summary: node.summary,
			chars: node.chars,
			truncated: node.truncated,
			ts_from: node.ts_from,
			ts_to: node.ts_to,
		}),
	};
}

/** @purpose Index every node event and its geometry across both compared histories. */
function collectNodeGeometry(
	before: readonly JsonlLine[],
	after: readonly JsonlLine[],
): {
	readonly byRange: ReadonlySet<string>;
	readonly maxLevel: ReadonlyMap<ScopeKey, number>;
} {
	const byRange = new Set<string>();
	const maxLevel = new Map<ScopeKey, number>();
	for (const history of [before, after]) {
		for (const event of history) {
			if (event.op !== "node") continue;
			byRange.add(
				rangeKey(event.scope, { start: event.start, level: event.level }),
			);
			maxLevel.set(
				event.scope,
				Math.max(maxLevel.get(event.scope) ?? 0, event.level),
			);
		}
	}
	return { byRange, maxLevel };
}

/** @purpose Find the highest historical candidate level on one path above a position. */
function maxHistoricalLevel(
	scope: ScopeKey,
	pos: number,
	minimum: number,
	geometry: ReturnType<typeof collectNodeGeometry>,
): number {
	let result = minimum;
	for (
		let level = geometry.maxLevel.get(scope) ?? 0;
		level > minimum;
		level -= 1
	) {
		const start = Math.floor(pos / 2 ** level) * 2 ** level;
		if (geometry.byRange.has(rangeKey(scope, { start, level }))) {
			result = level;
			break;
		}
	}
	return result;
}

/** @purpose Add every ancestor range on one old or new leaf path. */
function addPositionPath(
	ranges: Map<string, AffectedRange>,
	scope: ScopeKey,
	pos: number,
	root: number,
	geometry: ReturnType<typeof collectNodeGeometry>,
): void {
	const level = maxHistoricalLevel(scope, pos, root, geometry);
	for (let current = 1; current <= level; current += 1) {
		const start = Math.floor(pos / 2 ** current) * 2 ** current;
		const range = { scope, start, level: current };
		ranges.set(rangeKey(scope, range), range);
	}
}

/** @purpose Add every strict ancestor range of a selected candidate. */
function addStrictAncestorPath(
	ranges: Map<string, AffectedRange>,
	scope: ScopeKey,
	range: Range,
	root: number,
	geometry: ReturnType<typeof collectNodeGeometry>,
): void {
	const level = Math.max(
		range.level,
		maxHistoricalLevel(scope, range.start, root, geometry),
	);
	for (let current = range.level + 1; current <= level; current += 1) {
		const start = Math.floor(range.start / 2 ** current) * 2 ** current;
		const ancestor = { scope, start, level: current };
		ranges.set(rangeKey(scope, ancestor), ancestor);
	}
}

// #region FUNC_diffInputs
/**
 * @purpose Find changed live positions and changed selected candidates in both histories.
 * @invariants Changed note input affects every ancestor. Insertions, reordering, and transfers affect both old and new position paths.
 */
function diffInputs(
	before: Projection,
	after: Projection,
	geometry: ReturnType<typeof collectNodeGeometry>,
	ranges: Map<string, AffectedRange>,
): Set<ScopeKey> {
	const changedScopes = new Set<ScopeKey>();
	const previousLeaves = collectLiveInputs(before);
	const nextLeaves = collectLiveInputs(after);
	for (const key of new Set([...previousLeaves.keys(), ...nextLeaves.keys()])) {
		const oldLeaf = previousLeaves.get(key);
		const newLeaf = nextLeaves.get(key);
		if (oldLeaf?.input === newLeaf?.input) continue;
		const scope = (oldLeaf ?? newLeaf)?.scope;
		const pos = (oldLeaf ?? newLeaf)?.pos;
		if (scope === undefined || pos === undefined) continue;
		changedScopes.add(scope);
		const root = Math.max(
			rootLevel(before.scopeCounts.get(scope)?.total ?? 0),
			rootLevel(after.scopeCounts.get(scope)?.total ?? 0),
		);
		addPositionPath(ranges, scope, pos, root, geometry);
	}
	const previousNodes = collectSelectedNodes(before);
	const nextNodes = collectSelectedNodes(after);
	for (const key of new Set([...previousNodes.keys(), ...nextNodes.keys()])) {
		const oldNode = previousNodes.get(key);
		const newNode = nextNodes.get(key);
		if (oldNode?.input === newNode?.input) continue;
		const node = oldNode ?? newNode;
		if (!node) continue;
		changedScopes.add(node.scope);
		const root = Math.max(
			rootLevel(before.scopeCounts.get(node.scope)?.total ?? 0),
			rootLevel(after.scopeCounts.get(node.scope)?.total ?? 0),
		);
		addStrictAncestorPath(ranges, node.scope, node.range, root, geometry);
	}
	debug("Input comparison", {
		event: "path",
		changedScopes: changedScopes.size,
		ranges: ranges.size,
	});
	return changedScopes;
}
// #endregion FUNC_diffInputs

// #region FUNC_addCatalogPaths
/**
 * @purpose Compare visible scope positions and add the old and new catalog ancestor paths.
 * @invariants A scope root rebuild affects its catalog ancestors. A transfer affects the catalog paths of both scopes.
 */
function addCatalogPaths(
	before: Projection,
	after: Projection,
	profiles: ProfileScopes,
	changedScopes: ReadonlySet<ScopeKey>,
	ranges: Map<string, AffectedRange>,
	geometry: ReturnType<typeof collectNodeGeometry>,
): void {
	for (const [profile, resolved] of profiles) {
		const visible = new Set(resolved);
		const oldScopes = before.scopeOrder.filter((scope) => visible.has(scope));
		const newScopes = after.scopeOrder.filter((scope) => visible.has(scope));
		const positions = new Set<number>();
		for (
			let pos = 0;
			pos < Math.max(oldScopes.length, newScopes.length);
			pos += 1
		) {
			const oldScope = oldScopes[pos];
			const newScope = newScopes[pos];
			if (
				oldScope !== newScope ||
				(oldScope !== undefined && changedScopes.has(oldScope)) ||
				(newScope !== undefined && changedScopes.has(newScope))
			)
				positions.add(pos);
		}
		if (positions.size === 0) continue;
		const scope = catalogKey(profile);
		const root = Math.max(
			rootLevel(oldScopes.length),
			rootLevel(newScopes.length),
		);
		for (const pos of positions)
			addPositionPath(ranges, scope, pos, root, geometry);
	}
}
// #endregion FUNC_addCatalogPaths

// #region FUNC_collectTargets
/**
 * @purpose Preserve stale candidate exclusions and restore targets lost from the winning log.
 * @invariants Only targets present in resulting invalidate events suppress new invalidations.
 * @invariants Evidence for an absent node retains its source scope until a later import supplies the node.
 */
function collectTargets(
	beforeEvents: readonly JsonlLine[],
	afterEvents: readonly JsonlLine[],
	ranges: ReadonlyMap<string, AffectedRange>,
	importedNodes: readonly Ulid[],
	evidence: MergeResult["invalidationEvidence"],
): Map<ScopeKey, Set<Ulid>> {
	const persisted = new Set<Ulid>();
	const nodes = new Map<Ulid, NodeLine>();
	const previousNodes = new Map<Ulid, NodeLine>();
	for (const event of beforeEvents)
		if (event.op === "node") previousNodes.set(event.id, event);
	for (const event of afterEvents) {
		if (event.op === "invalidate")
			for (const id of event.targets) persisted.add(id);
		if (event.op === "node") nodes.set(event.id, event);
	}
	const targets = new Map<ScopeKey, Set<Ulid>>();
	const add = (scope: ScopeKey, id: Ulid): void => {
		if (persisted.has(id)) return;
		const group = targets.get(scope);
		if (group) group.add(id);
		else targets.set(scope, new Set([id]));
	};
	const imported = new Set(importedNodes);
	for (const event of nodes.values()) {
		const newlySanitized =
			event.redacted &&
			previousNodes.has(event.id) &&
			!previousNodes.get(event.id)?.redacted;
		if (event.redacted && !newlySanitized) continue;
		const affected = ranges.has(
			rangeKey(event.scope, { start: event.start, level: event.level }),
		);
		if (!event.redacted && !affected && !imported.has(event.id)) continue;
		add(event.scope, event.id);
	}
	for (const item of evidence) {
		for (const id of item.targets)
			add(
				nodes.get(id)?.scope ?? previousNodes.get(id)?.scope ?? item.scope,
				id,
			);
	}
	return targets;
}
// #endregion FUNC_collectTargets

// #region FUNC_planInvalidation
/**
 * @purpose Identify stale scope and catalog paths before the backend publishes a write.
 * @requires Histories have valid fields and unique ids. Profiles contain resolved scope filters.
 * @invariants Changed live input invalidates old and new ancestor paths, including historical candidates.
 * @invariants A local node publication invalidates ancestors only. New imported candidates also become targets.
 * @invariants Targets already in the resulting log need no new event. Re-emit invalidation evidence lost during conflict resolution.
 * @invariants Missing node targets retain their evidence scope. Known node targets use the node scope.
 * @invariants An unchanged history with no missing evidence gives an empty plan.
 */
export function planInvalidation(
	before: readonly JsonlLine[],
	after: readonly JsonlLine[],
	profiles: ProfileScopes = new Map(),
	importedNodes: readonly Ulid[] = [],
	evidence: MergeResult["invalidationEvidence"] = [],
): InvalidationPlan {
	debug("Invalidation start", {
		event: "start",
		before: before.length,
		after: after.length,
		profiles: profiles.size,
		imported: importedNodes.length,
	});
	const retained = [
		...before.filter((event) => event.op === "invalidate"),
		...evidence,
	];
	const excluded = [
		...importedNodes,
		...new Set(retained.flatMap((item) => item.targets)),
	];
	const previous = project(before);
	const next = project(after, 0, excluded);
	const geometry = collectNodeGeometry(before, after);
	const ranges = new Map<string, AffectedRange>();
	const changedScopes = diffInputs(previous, next, geometry, ranges);
	addCatalogPaths(previous, next, profiles, changedScopes, ranges, geometry);
	const targets = collectTargets(
		before,
		after,
		ranges,
		importedNodes,
		retained,
	);
	const sortedRanges = [...ranges.values()].sort(
		(left, right) =>
			compareText(left.scope, right.scope) ||
			left.start - right.start ||
			left.level - right.level,
	);
	const invalidations = [...targets]
		.map(([scope, ids]) => ({ scope, targets: [...ids].sort(compareText) }))
		.sort((left, right) => compareText(left.scope, right.scope));
	for (const range of sortedRanges) {
		debug("Invalidation path", {
			event: "path",
			scope: range.scope,
			start: range.start,
			level: range.level,
		});
	}
	debug("Invalidation complete", {
		event: "complete",
		ranges: sortedRanges.length,
		scopes: invalidations.length,
		targets: invalidations.reduce(
			(count, item) => count + item.targets.length,
			0,
		),
	});
	return { ranges: sortedRanges, invalidations };
}
// #endregion FUNC_planInvalidation
