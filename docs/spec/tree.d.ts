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
 *  - A node is built when its two children sit at the two halves of its range.
 *  - A node is clean when the revision of its children equals `input_rev`.
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
 * A range of level 1 holds two records, and a range of level `l` holds `2^l` records. The address
 * of a range is `start..start + 2^level - 1`. A record has the address `pos`.
 */
export interface Range {
	readonly start: Pos;
	readonly level: Level;
}

/** The order of the latest event that touches a range. An empty range gives null. */
export type Rev = Order | null;

/** One note event. Its `pos` is fixed, and a later event changes no address. */
export interface NoteEvent {
	readonly op: "note";
	readonly id: Id;
	readonly order: Order;
	readonly pos: Pos;
	readonly body: string;
	readonly at: string;
}

/** One summary of a range, recorded as an event. */
export interface NodeEvent {
	readonly op: "node";
	readonly id: Id;
	readonly order: Order;
	readonly range: Range;
	/** The event id of the record or the node at the left half. */
	readonly child_a: Id;
	/** The event id of the record or the node at the right half. */
	readonly child_b: Id;
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

/** The log of one scope: the records and the nodes. */
export interface Tree {
	readonly notes: readonly NoteEvent[];
	readonly nodes: readonly NodeEvent[];
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

/** The current node of a range is the latest node event of that range. */
export declare function currentNode(tree: Tree, range: Range): NodeEvent | null;

/**
 * The revision of a range: the latest order of the events that touch it.
 *
 * A record touches its own position. A node touches its own range. A node of a smaller range
 * touches each range above it.
 */
export declare function rev(tree: Tree, range: Range): Rev;

/**
 * Tell whether a node is built.
 *
 * A node is built when `child_a` is the event at the left half and `child_b` is the event at the
 * right half. The check reads the `pos` of each child, so an import that moves the positions makes
 * the node not built.
 */
export declare function isBuilt(tree: Tree, node: NodeEvent): boolean;

/**
 * Tell whether a node is clean.
 *
 * A node is clean when the revision of its two children equals `input_rev`. A built node of a
 * record pair is clean when no event touched the two records after the build.
 */
export declare function isClean(tree: Tree, node: NodeEvent): boolean;

/**
 * Give the slice of one scope.
 *
 * The slice is the frontier. The fold takes one pair at a time and stops as soon as the count of
 * lines is not above the budget. Among the pairs, it takes one that keeps the levels of the two
 * neighbours within one step, then the pair with the greatest `due`, then the lowest level, then
 * the lowest start. A pair merges though its node
 * is not built, so a temporary line takes the place of the two lines. The last line is always a
 * record, because the pair of the last position never merges. When no pair can merge and the count
 * is still above the budget, the oldest lines leave the slice.
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
