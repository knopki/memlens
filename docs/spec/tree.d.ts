/**
 * Row-store range, build, and slice types.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Define range and slice types for the row-store view.
 * @keywords tree, node, pos, address, slice, frontier
 * #endregion moduleContract
 */

/** The ordinal of a note in a scope. */
export type Pos = number;

/** The size of a range as a power of two. Level zero holds one position. */
export type Level = number;

/** A count of lines in the slice. */
export type Lines = number;

/** A range of positions under one line of the view. */
export interface Range {
	readonly start: Pos;
	readonly level: Level;
}

/** One line of the slice. */
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

/** The root range starts at zero. A total of zero gives null. */
export declare function topRangeOf(total: Pos): Range | null;

/** Keep text within a limit and cut it at a word boundary. */
export declare function cutAtWord(text: string, limit: number): string;

/** Join two child texts within the line limit. */
export declare function joinBody(
	first: string,
	rest: string,
	limit: number,
): string;

/** Fold sorted live positions into a bounded frontier. */
export declare function foldPositions(
	positions: readonly Pos[],
	total: Pos,
	budget: Lines,
): readonly Range[];

/** Rank one range by age relative to the assigned extent. */
export declare function due(total: Pos, range: Range): number;
