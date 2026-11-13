/**
 * Store view and compaction types.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Define the range and slice types shared by the row-store view. @keywords tree, node, pos, address, revision, slice, frontier
 * #endregion moduleContract
 */

/** The ordinal of a note in a scope. The tree has no node of level 0. */
export type Pos = number;

/** The size of a range as a power of two. Level 0 is one record. */
export type Level = number;

/** The immutable note order key: the timestamp and id, compared as text. */
export type Order = `${string}|${string}`;

/** The identity of a stored note or node. */
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
