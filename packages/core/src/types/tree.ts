/**
 * Tree model types and functions.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Hold the tree rules in one type file, so the requirements and the code have one source.
 * @scope
 *  - The record positions, the nodes, the revision of a range, and the slice.
 *  - NOT: the log, the store, the writer, and the tools.
 * @invariants
 *  - A node covers 2^level positions from start, and level is 1 or more.
 *  - Each child reference matches its half. A null reference denotes only an empty half.
 *  - A clean node is built, has clean children, and has no invalidation.
 * @keywords tree, node, pos, address, revision, slice, frontier
 * #endregion moduleContract
 */

/** The ordinal of a note event in a scope. The tree has no node of level 0. */
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
 * A range of level 0 holds one position. A range of level l holds 2^l positions, which can be empty.
 * Only a node requires a level of 1 or more. A record has the address pos.
 * The address of a larger range is start..start + 2^level - 1.
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

/** One summary of a range in the tree. */
export interface TreeNode {
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
	/**
	 * A catalog uses an empty notes array and maps its positions to existing record trees.
	 * Each leaf is the current top node of that tree, with no new event or record.
	 * A scope with live records and no clean top node is non-empty but not ready.
	 * Record trees have no scope_roots map. A profile includes no other catalog in this map.
	 */
	readonly scope_roots?: ReadonlyMap<Pos, Tree>;
	/** The projection excludes sanitized node events from this candidate input. */
	readonly nodes: readonly TreeNode[];
	/** The target ids of invalidate events. The projection derives this set from the log. */
	readonly invalidated: readonly Id[];
}

/**
 * One line of the slice.
 *
 * A record gives its body. A clean node gives its summary. A missing or dirty node gives the text
 * of its two children, joined for the render only. The line of a node is no part of a summary.
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
			/** The text of the range, assembled from its children for this render only. */
			readonly text: string;
	  };

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
			/**
			 * The catalog position of a scope root. The range of that node belongs to the scope
			 * tree, and the catalog line names the position.
			 */
			readonly pos?: Pos;
	  };

/** A background build copies these values. It does not keep mutable references to the projection. */
export interface BuildInput {
	readonly range: Range;
	/** Null means an empty half. At least one half must be non-empty. */
	readonly children: readonly [BuildChild | null, BuildChild | null];
}
