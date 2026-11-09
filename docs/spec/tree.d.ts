/**
 * The model of the tree, the revision of a range, and the slice.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Hold the tree rules in one type file, so the requirements and the code have one source.
 * @scope
 *  - The record positions, the nodes, the revision of a range, and the slice.
 *  - NOT: the log, the store, the writer queue, and the tools.
 * @invariants
 *  - A node covers `2^level` positions from `start`, and level 1 or more.
 *  - Each child reference matches its half. A null reference denotes only an empty half.
 *  - A clean node is built, has clean children, and has no invalidation.
 * @keywords tree, node, pos, address, revision, slice, frontier
 * #endregion moduleContract
 */

/** The ordinal of a `note` event in a scope. The tree has no node of level 0. */
export type Pos = number;

/** The size of a range as a power of two. Level 0 is one record. */
export type Level = number;

/** The order of an event in the projection: the time and the id, compared as text. */
export type Order = `${string}|${string}`;

/** The identity of an event. */
export type Id = string;

/** A count of lines of the slice. */
export type Lines = number;

/**
 * A range of positions under one line of the view.
 *
 * A range of level 0 holds one position. A range of level `l` holds `2^l` positions, which can be empty.
 * Only a node requires a level of 1 or more. A record has the address `pos`.
 * The address of a larger range is `start..start + 2^level - 1`.
 */
export interface Range {
	readonly start: Pos;
	readonly level: Level;
}

/** The latest input order of a non-empty range. A range with no live record gives null. */
export type Rev = Order | null;

/** The current record from the projection, not the original note event. */
export interface TreeRecord {
	readonly id: Id;
	/** The latest order of the events that affect this record. */
	readonly order: Order;
	readonly pos: Pos;
	readonly state: "live" | "hidden" | "deleted";
	readonly body: string;
	readonly longform: string | null;
	readonly at: string;
	readonly ts: string;
}

/** One summary of a range, recorded as an event. */
export interface NodeEvent {
	readonly op: "node";
	readonly id: Id;
	readonly order: Order;
	readonly range: Range;
	/** The left child id, or null when that half has no live record. */
	readonly child_a: Id | null;
	/** The right child id, or null when that half has no live record. */
	readonly child_b: Id | null;
	/** The revision of the two children at the time of the build. */
	readonly input_rev: Rev;
	readonly summary: string;
	/** The length of the summary line in characters. */
	readonly chars: number;
	/** True when the build cut the line at the limit of characters. */
	readonly truncated: boolean;
	readonly ts_from: string;
	readonly ts_to: string;
}

/** The tree input from the projection of one scope. */
export interface Tree {
	/** One plus the greatest assigned position. Hidden and deleted records still count. */
	readonly total: Pos;
	readonly notes: readonly TreeRecord[];
	readonly nodes: readonly NodeEvent[];
	/** The target ids of invalidate events. The projection derives this set from the log. */
	readonly invalidated: readonly Id[];
}

/**
 * One line of the slice.
 *
 * A record gives its body. A clean node gives its summary. Another node gives no text, and the
 * line shows the period of its range. The line of a node is no part of a summary.
 */
export type SliceLine =
	| {
			readonly kind: "record";
			readonly pos: Pos;
			readonly from: string;
			readonly to: string;
			readonly body: string;
	  }
	| {
			readonly kind: "summary";
			readonly range: Range;
			readonly from: string;
			readonly to: string;
			readonly summary: string;
	  }
	| {
			readonly kind: "temporary";
			readonly range: Range;
			readonly from: string;
			readonly to: string;
	  };

/** The root starts at zero with level max(1, ceil(log2(total))). A total of zero gives null. */
export declare function topRange(tree: Tree): Range | null;

/** The current node is the latest node of the range whose id has no invalidation. */
export declare function currentNode(tree: Tree, range: Range): NodeEvent | null;

/**
 * The revision of a range: the latest order of the events that touch it.
 *
 * A live record carries the latest order of its mutations. A current node contributes its order within a non-empty range.
 * A range with no live record gives null, even when hidden records remain at its positions.
 * The maximum is not proof of an unchanged input after an import. The invalidation check is also necessary.
 */
export declare function rev(tree: Tree, range: Range): Rev;

/**
 * Tell whether a node is built.
 *
 * Each non-null child id must name the live record or node at that exact half of the range.
 * A record has the expected position. A child node has the expected start and level.
 * A null child is valid only when its half has no live record, including padding beyond `total`.
 * A missing summary of a non-empty half does not satisfy the check. A node with two empty halves is not built.
 */
export declare function isBuilt(tree: Tree, node: NodeEvent): boolean;

/**
 * Tell whether a node is clean.
 *
 * A clean node is built and has no invalidation. Each non-empty child node must also be clean.
 * The revision of its two children must equal `input_rev`. This equality alone does not prove freshness.
 * A change of summary input invalidates every affected summary candidate before the next read.
 */
export declare function isClean(tree: Tree, node: NodeEvent): boolean;

/** The values of one non-empty child that a model call reads. */
export type BuildChild =
	| {
			readonly kind: "record";
			readonly id: Id;
			readonly pos: Pos;
			readonly body: string;
			readonly preview: string;
			readonly ts: string;
	  }
	| {
			readonly kind: "node";
			readonly id: Id;
			readonly range: Range;
			readonly summary: string;
			readonly ts_from: string;
			readonly ts_to: string;
	  };

/** A job copies these values. It does not retain mutable references to the projection. */
export interface BuildInput {
	readonly range: Range;
	/** Null means an empty half. At least one half must be non-empty. */
	readonly children: readonly [BuildChild | null, BuildChild | null];
}

/**
 * Copy live records or clean nodes, with null children for empty halves.
 * A dirty non-empty half or two empty halves make this function return null.
 * One non-empty child copies its text and dates without a model call.
 */
export declare function buildInput(tree: Tree, range: Range): BuildInput | null;

/** Compare both children, including empty halves. A changed live state or a dirty non-empty child fails the check. */
export declare function inputUnchanged(tree: Tree, input: BuildInput): boolean;

/**
 * Give the slice of one scope.
 *
 * The slice is the frontier. The fold takes one pair at a time and stops as soon as the count of
 * lines is not above the budget. Among the pairs, it takes one that keeps the levels of the two
 * neighbours within one step, then the pair with the greatest `due`, then the lowest level, then
 * the lowest start. A pair merges though its node
 * is not built, so a temporary line takes the place of the two lines. Empty ranges do not render or count against the budget.
 * A pair that covers the greatest live position never merges, so a non-empty slice ends with that record.
 * When no pair can merge and the count is still above the budget, the oldest lines leave the slice.
 * A scope with no live record gives an empty slice. Dates come from the first and last live records in each range.
 *
 * The budget counts lines, not characters. See [config.d.ts](config.d.ts).
 */
export declare function slice(tree: Tree, budget: Lines): readonly SliceLine[];

/**
 * The priority of a pair. The fold takes the greatest `due` first, then the lowest level, then the
 * lowest start.
 *
 * `total` is the count of positions of the scope, so an import that changes `total` changes each
 * `due`.
 */
export declare function due(total: Pos, range: Range): number;
