/**
 * #region moduleContract
 * @purpose Derive clean summaries and bounded slices from the current tree projection.
 * @scope Tree reads and copied build inputs. No log scans, event appends, storage, or model calls.
 * @invariants
 * - A node key is (level, start). A level covers 2^level positions; node levels start at one.
 * - The tree has no depth limit: the levels grow with the highest live position.
 * - A record is a leaf at its position. Hidden and deleted records leave empty positions without a shift.
 * - A clean node gives its summary. A temporary line gives the text of its two children, joined for
 * the render only. No hash check, no model call, and no stored node are involved.
 * - Scope trees and catalogs use the same engine. A catalog leaf resolves its scope tree through scope_roots.
 * - Every read uses the supplied projection. No read waits for a writer or retains state between calls.
 * #endregion moduleContract
 */
import { debuglog } from "node:util";
import type {
	BuildChild,
	BuildInput,
	Lines,
	Pos,
	Range,
	Rev,
	SliceLine,
	Tree,
	TreeNode,
	TreeRecord,
} from "../types/tree.js";

const debug = debuglog("memlens:tree");

/** The greatest character count of one line of the view. */
export const LINE_LIMIT = 640;
const key = (range: Range) => `${range.start}:${range.level}`;
const contains = (range: Range, pos: Pos) =>
	pos >= range.start && pos < range.start + 2 ** range.level;
const max = (a: Rev, b: Rev): Rev =>
	a === null || (b !== null && b > a) ? b : a;
const halves = (range: Range): [Range, Range] => [
	{ start: range.start, level: range.level - 1 },
	{ start: range.start + 2 ** (range.level - 1), level: range.level - 1 },
];

// #region FUNC_cutAtWord
/**
 * @purpose Keep one text within a character limit and end it at a word boundary.
 * @invariants A text at or below the limit stays unchanged. A longer text cuts at its last space
 * before the limit, or at the limit when it holds no space.
 */
export function cutAtWord(text: string, limit: number): string {
	if (text.length <= limit) return text;
	const cut = text.slice(0, limit);
	const space = cut.lastIndexOf(" ");
	return space > 0 ? cut.slice(0, space) : cut;
}
// #endregion FUNC_cutAtWord

type Leaf = {
	pos: Pos;
	record?: TreeRecord;
	scope?: Model;
};

// #region CLASS_Model
/** @purpose Index one read without retaining mutable projection state between calls. */
class Model {
	readonly leaves: Leaf[];
	readonly nodes = new Map<string, TreeNode>();
	readonly invalidated: Set<string>;
	private readonly revisions = new Map<string, Rev>();
	private readonly built = new Map<TreeNode, boolean>();
	private readonly clean = new Map<TreeNode, boolean>();

	constructor(readonly tree: Tree) {
		this.invalidated = new Set(tree.invalidated);
		for (const node of tree.nodes) {
			if (this.invalidated.has(node.id)) continue;
			const address = key(node.range);
			const previous = this.nodes.get(address);
			if (!previous || node.order > previous.order)
				this.nodes.set(address, node);
		}
		this.leaves = tree.scope_roots
			? [...tree.scope_roots].flatMap(([pos, scope]) => {
					const model = new Model(scope);
					return model.leaves.length ? [{ pos, scope: model }] : [];
				})
			: tree.notes
					.filter((note) => note.state === "live")
					.map((record) => ({ pos: record.pos, record }));
		this.leaves.sort((a, b) => a.pos - b.pos);
	}

	node(range: Range): TreeNode | null {
		return this.nodes.get(key(range)) ?? null;
	}

	// #region METHOD_live
	/** @purpose Find occupied positions without a scan of the assigned extent. */
	live(range: Range): Leaf[] {
		const lower = (pos: Pos) => {
			let start = 0;
			let end = this.leaves.length;
			while (start < end) {
				const middle = Math.floor((start + end) / 2);
				if ((this.leaves[middle]?.pos ?? Infinity) < pos) start = middle + 1;
				else end = middle;
			}
			return start;
		};
		return this.leaves.slice(
			lower(range.start),
			lower(range.start + 2 ** range.level),
		);
	}
	// #endregion METHOD_live

	root(): TreeNode | null {
		const range = topRange(this.tree);
		return range ? this.node(range) : null;
	}

	// #region METHOD_revision
	/**
	 * @purpose Include current node orders only within non-empty subranges.
	 * @invariants A revision is the greatest live record order or current node order within the range.
	 * Empty ranges return null. Catalog leaves include the revision of their scope tree.
	 */
	revision(range: Range): Rev {
		const address = key(range);
		if (this.revisions.has(address)) return this.revisions.get(address) ?? null;
		const leaves = this.live(range);
		let result: Rev = null;
		for (const leaf of leaves) {
			const scopeRange = leaf.scope ? topRange(leaf.scope.tree) : null;
			result = max(
				result,
				leaf.record?.order ??
					(scopeRange ? (leaf.scope?.revision(scopeRange) ?? null) : null),
			);
		}
		if (leaves.length && range.level > 0) {
			for (const node of this.nodes.values()) {
				if (
					node.range.level <= range.level &&
					node.range.start >= range.start &&
					node.range.start + 2 ** node.range.level <=
						range.start + 2 ** range.level &&
					this.live(node.range).length
				)
					result = max(result, node.order);
			}
		}
		this.revisions.set(address, result);
		return result;
	}
	// #endregion METHOD_revision

	// #region METHOD_isBuilt
	/**
	 * @purpose Check child identities at exact positions through all node levels.
	 * @invariants Each child names its exact half. Null matches only an empty half, including padding beyond total.
	 * A non-empty half requires its live record or built child node. Two empty halves are not built.
	 * A catalog child names its clean scope root. That root keeps its own range, independent of its catalog position.
	 */
	isBuilt(node: TreeNode): boolean {
		const cached = this.built.get(node);
		if (cached !== undefined) return cached;
		const result =
			node.range.level >= 1 &&
			this.live(node.range).length > 0 &&
			halves(node.range).every((half, index) => {
				const ref = index === 0 ? node.child_a : node.child_b;
				const leaves = this.live(half);
				if (!leaves.length) return ref === null;
				if (ref === null) return false;
				if (half.level === 0) {
					const leaf = leaves[0];
					if (leaf?.record) return leaf.record.id === ref;
					const root = leaf?.scope?.root();
					return !!root && root.id === ref && !!leaf?.scope?.isClean(root);
				}
				const child = this.node(half);
				return !!child && child.id === ref && this.isBuilt(child);
			});
		this.built.set(node, result);
		return result;
	}
	// #endregion METHOD_isBuilt

	// #region METHOD_isClean
	/**
	 * @purpose Require clean descendants and the exact current child revision.
	 * @invariants A clean node is built, has no invalidation, and has clean non-empty child nodes.
	 * The greatest child revision equals input_rev. Revision equality alone never overrides an invalidation.
	 */
	isClean(node: TreeNode): boolean {
		const cached = this.clean.get(node);
		if (cached !== undefined) return cached;
		const children = halves(node.range);
		const result =
			!this.invalidated.has(node.id) &&
			this.isBuilt(node) &&
			children.every((half) => {
				if (half.level === 0 || !this.live(half).length) return true;
				const child = this.node(half);
				return child !== null && this.isClean(child);
			}) &&
			max(this.revision(children[0]), this.revision(children[1])) ===
				node.input_rev;
		this.clean.set(node, result);
		return result;
	}
	// #endregion METHOD_isClean

	// #region METHOD_period
	/**
	 * @purpose Keep range dates tied to its first and last live leaves.
	 * @invariants Dates use ts from the first and last live notes in position order, never at.
	 * Hidden records and empty padding give no dates. Catalog periods resolve through their scope trees.
	 */
	period(range: Range): { from: string; to: string } {
		const leaves = this.live(range);
		const first = leaves[0];
		const last = leaves[leaves.length - 1];
		const firstRange = first?.scope ? topRange(first.scope.tree) : null;
		const lastRange = last?.scope ? topRange(last.scope.tree) : null;
		return {
			from:
				first?.record?.ts ??
				(firstRange ? (first?.scope?.period(firstRange).from ?? "") : ""),
			to:
				last?.record?.ts ??
				(lastRange ? (last?.scope?.period(lastRange).to ?? "") : ""),
		};
	}

	// #endregion METHOD_period

	// #region METHOD_input
	/**
	 * @purpose Copy ready children and retain null for each empty half.
	 * @invariants Input holds only the two children. Records supply bodies; clean nodes supply summaries and stored dates.
	 * Record previews copy at most 1024 longform characters. Copies retain no mutable record or range reference.
	 * A dirty non-empty half or two empty halves return null. A missing scope root is not an empty scope.
	 */
	input(range: Range): BuildInput | null {
		if (range.level < 1 || !this.live(range).length) return null;
		const children: [BuildChild | null, BuildChild | null] = [null, null];
		for (const [index, half] of halves(range).entries()) {
			const leaves = this.live(half);
			if (!leaves.length) continue;
			const leaf = leaves[0];
			if (half.level === 0 && leaf?.record) {
				const record = leaf.record;
				children[index] = {
					kind: "record",
					id: record.id,
					pos: record.pos,
					body: record.body,
					preview: (record.longform ?? "").slice(0, 1024),
					ts: record.ts,
				};
				continue;
			}
			const model = half.level === 0 ? leaf?.scope : this;
			const node = half.level === 0 ? model?.root() : this.node(half);
			if (!model || !node || !model.isClean(node)) return null;
			children[index] = {
				kind: "node",
				id: node.id,
				range: { ...node.range },
				summary: node.summary,
				ts_from: node.ts_from,
				ts_to: node.ts_to,
				...(half.level === 0 ? { pos: half.start } : {}),
			};
		}
		return { range: { ...range }, children };
	}
	// #endregion METHOD_input
}
// #endregion CLASS_Model

// #region FUNC_topRange
/**
 * @purpose Keep the root extent tied to all assigned positions.
 * @invariants Positive total gives start 0 and level max(1, ceil(log2(total))). Zero total gives null.
 * Total includes hidden and deleted positions. The root has no fixed depth limit.
 */
export function topRange(tree: Tree): Range | null {
	return tree.total > 0
		? { start: 0, level: Math.max(1, Math.ceil(Math.log2(tree.total))) }
		: null;
}
// #endregion FUNC_topRange

// #region FUNC_currentNode
/**
 * @purpose Select the latest candidate without a durable invalidation.
 * @invariants Compare orders as text within the exact (level, start) key. Exclude every invalidated id.
 */
export function currentNode(tree: Tree, range: Range): TreeNode | null {
	return new Model(tree).node(range);
}
// #endregion FUNC_currentNode

// #region FUNC_rev
/** @purpose Track the latest input order within a non-empty range. */
export function rev(tree: Tree, range: Range): Rev {
	return new Model(tree).revision(range);
}
// #endregion FUNC_rev

// #region FUNC_isBuilt
/** @purpose Reject child references outside their exact halves. */
export function isBuilt(tree: Tree, node: TreeNode): boolean {
	return new Model(tree).isBuilt(node);
}
// #endregion FUNC_isBuilt

// #region FUNC_isClean
/** @purpose Reject invalidated summaries and stale child revisions. */
export function isClean(tree: Tree, node: TreeNode): boolean {
	const clean = new Model(tree).isClean(node);
	debug("Node freshness", {
		start: node.range.start,
		level: node.range.level,
		clean,
	});
	return clean;
}
// #endregion FUNC_isClean

// #region FUNC_buildInput
/** @purpose Copy the exact ready children for a background build. */
export function buildInput(tree: Tree, range: Range): BuildInput | null {
	const input = new Model(tree).input(range);
	debug("Build input", {
		start: range.start,
		level: range.level,
		ready: input !== null,
	});
	return input;
}
// #endregion FUNC_buildInput

// #region FUNC_candidates
/**
 * @purpose Prioritize dirty non-empty ranges without persistent jobs.
 * @invariants Derive aligned ranges from level one through the root for every live position.
 * Missing summaries are candidates. Empty ranges and clean ranges are not candidates.
 * Compare greatest due, lowest parent level, then lowest start. Compute due with the child level.
 */
export function candidates(tree: Tree): readonly Range[] {
	const root = topRange(tree);
	if (!root) return [];
	const model = new Model(tree);
	const ranges = new Map<string, Range>();
	for (const leaf of model.leaves) {
		for (let level = 1; level <= root.level; level += 1) {
			const range = {
				start: Math.floor(leaf.pos / 2 ** level) * 2 ** level,
				level,
			};
			ranges.set(key(range), range);
		}
	}
	const result = [...ranges.values()]
		.filter((range) => {
			const node = model.node(range);
			return !node || !model.isClean(node);
		})
		.sort((a, b) => priority(tree.total, a, b));
	debug("Build candidates", { total: tree.total, count: result.length });
	return result;
}
// #endregion FUNC_candidates

// #region FUNC_inputUnchanged
/**
 * @purpose Reject a build result when either copied child changes.
 * @invariants Compare both copied halves by value, including null halves, positions, text, previews, and stored node dates.
 * A changed live state or dirty non-empty child fails. An unchanged input can pass more than once.
 */
export function inputUnchanged(tree: Tree, input: BuildInput): boolean {
	const current = new Model(tree).input(input.range);
	const unchanged =
		current?.children.every((child, index) =>
			sameChild(child, input.children[index] ?? null),
		) ?? false;
	debug("Input comparison", {
		start: input.range.start,
		level: input.range.level,
		unchanged,
	});
	return unchanged;
}
// #endregion FUNC_inputUnchanged

function sameChild(a: BuildChild | null, b: BuildChild | null): boolean {
	if (a === null || b === null) return a === b;
	if (a.kind === "record" && b.kind === "record") {
		return (
			a.id === b.id &&
			a.pos === b.pos &&
			a.body === b.body &&
			a.preview === b.preview &&
			a.ts === b.ts
		);
	}
	return (
		a.kind === "node" &&
		b.kind === "node" &&
		a.id === b.id &&
		a.range.start === b.range.start &&
		a.range.level === b.range.level &&
		a.summary === b.summary &&
		a.ts_from === b.ts_from &&
		a.ts_to === b.ts_to
	);
}

function priority(total: Pos, a: Range, b: Range): number {
	return (
		due(total, { start: b.start, level: b.level - 1 }) -
			due(total, { start: a.start, level: a.level - 1 }) ||
		a.level - b.level ||
		a.start - b.start
	);
}

// #region FUNC_fold
/** @purpose Fold one pair at a time without allocating every empty position. */
export function fold(tree: Tree, budget: Lines): readonly Range[] {
	return frontier(new Model(tree), budget);
}
// #endregion FUNC_fold

type MergePick = {
	index: number;
	range: Range;
	jump: number;
	reduction: number;
};

// #region FUNC_sparseBlocks
/**
 * @purpose Tile empty gaps without allocating every assigned position.
 * @invariants Blocks tile [0, total) in position order with no gap or overlap.
 * Every block start is a multiple of 2^level. Empty gaps need no dense prefix.
 */
function sparseBlocks(model: Model): Range[] {
	const blocks: Range[] = [];
	let cursor = 0;
	const empty = (end: number) => {
		while (cursor < end) {
			let level = Math.floor(Math.log2(end - cursor));
			while (cursor % 2 ** level !== 0) level -= 1;
			blocks.push({ start: cursor, level });
			cursor += 2 ** level;
		}
	};
	for (const leaf of model.leaves) {
		empty(leaf.pos);
		blocks.push({ start: leaf.pos, level: 0 });
		cursor = leaf.pos + 1;
	}
	empty(model.tree.total);
	return blocks;
}
// #endregion FUNC_sparseBlocks

// #region FUNC_selectMerge
/**
 * @purpose Select the best sibling pair while preserving the greatest live leaf.
 * @invariants A pair has adjacent blocks of equal level and a start divisible by the parent width.
 * No pair covers the greatest live position. Node readiness does not restrict a merge.
 * Minimize the sum of max(0, parentLevel - 1 - neighbourLevel) over existing outer neighbours.
 * Resolve ties with the order from candidates.
 */
function selectMerge(
	model: Model,
	blocks: readonly Range[],
	highest: Pos,
): MergePick | null {
	let best: MergePick | null = null;
	for (let index = 0; index + 1 < blocks.length; index += 1) {
		const left = blocks[index];
		const right = blocks[index + 1];
		if (!left || !right || left.level !== right.level) continue;
		const range = { start: left.start, level: left.level + 1 };
		if (
			right.start !== left.start + 2 ** left.level ||
			left.start % 2 ** range.level !== 0 ||
			contains(range, highest)
		)
			continue;
		const jump = [blocks[index - 1], blocks[index + 2]].reduce(
			(sum, neighbour) =>
				sum + (neighbour ? Math.max(0, range.level - 1 - neighbour.level) : 0),
			0,
		);
		const reduction =
			Number(model.live(left).length > 0) +
			Number(model.live(right).length > 0) -
			Number(model.live(range).length > 0);
		if (
			!best ||
			jump < best.jump ||
			(jump === best.jump && priority(model.tree.total, range, best.range) < 0)
		) {
			best = { index, range, jump, reduction };
		}
	}
	return best;
}
// #endregion FUNC_selectMerge

// #region FUNC_frontier
/**
 * @purpose Fold selected pairs until the rendered count fits, then evict excess oldest lines.
 * @invariants Merge one pair only while the live line count exceeds the supplied line budget. Stop as soon as it fits.
 * Empty blocks never render or count against the budget. No range appears beside its descendants.
 * When no pair remains, evict the oldest excess lines. Preserve at least the greatest live leaf, even at budget zero.
 */
function frontier(model: Model, budget: Lines): Range[] {
	if (!model.leaves.length) return [];
	const highest = model.leaves[model.leaves.length - 1]?.pos ?? 0;
	const blocks = sparseBlocks(model);
	let count = model.leaves.length;
	while (count > budget) {
		const best = selectMerge(model, blocks, highest);
		if (!best) break;
		blocks.splice(best.index, 2, best.range);
		count -= best.reduction;
	}
	const visible = blocks.filter((range) => model.live(range).length);
	const result = visible.slice(
		Math.max(0, visible.length - Math.max(1, budget)),
	);
	debug("Fold result", {
		total: model.tree.total,
		budget,
		count: result.length,
	});
	return result;
}
// #endregion FUNC_frontier

// #region FUNC_rangeBody
/**
 * @purpose Give the body text of one range without a model call, for the line of a temporary range.
 * @invariants A clean node gives its summary. A record gives its body and then its longform. Other
 * ranges join the two halves with "; ". The result holds at most the limit in characters.
 * A hidden or deleted record gives no text. A catalog leaf resolves its scope root.
 * Above the limit, each half keeps a share of the room in proportion to its own length, and a half
 * that is short of its share keeps its whole text.
 */
function rangeBody(model: Model, range: Range, limit: number): string {
	if (limit <= 0) return "";
	if (range.level === 0) {
		const leaf = model.live(range)[0];
		if (!leaf) return "";
		if (leaf.record) {
			const text = leaf.record.longform
				? `${leaf.record.body}\n${leaf.record.longform}`
				: leaf.record.body;
			return text.slice(0, limit);
		}
		if (!leaf.scope) return "";
		const root = topRange(leaf.scope.tree);
		return root ? rangeBody(leaf.scope, root, limit) : "";
	}
	const node = model.node(range);
	if (node && model.isClean(node)) return node.summary.slice(0, limit);
	const [left, right] = halves(range);
	const first = rangeBody(model, left, limit);
	const rest = rangeBody(model, right, limit);
	return joinBody(first, rest, limit);
}

// #region FUNC_joinBody
/**
 * @purpose Join the two half texts of one range within the limit of a line.
 * @invariants A short pair joins whole. Above the limit, each half keeps a share of the room in
 * proportion to its own length, and a half below its share keeps its whole text.
 * A half at the limit stands for a longer text, so the other half keeps its whole text.
 */
function joinBody(first: string, rest: string, limit: number): string {
	if (!first) return rest.slice(0, limit);
	if (!rest) return first.slice(0, limit);
	const room = Math.max(0, limit - 2);
	if (first.length + rest.length <= room) return `${first}; ${rest}`;
	const capped = (text: string) => text.length >= limit;
	if (capped(first) !== capped(rest)) {
		const [long, short] = capped(first) ? [first, rest] : [rest, first];
		const cut = cutAtWord(long, Math.max(0, room - short.length));
		return capped(first) ? `${cut}; ${short}` : `${short}; ${cut}`;
	}
	const share = Math.floor(
		(room * first.length) / (first.length + rest.length),
	);
	return `${cutAtWord(first, share)}; ${cutAtWord(rest, room - share)}`;
}
// #endregion FUNC_joinBody
// #endregion FUNC_rangeBody

// #region FUNC_slice
/**
 * @purpose Render the minimal fold while preserving the greatest live leaf.
 * @invariants Lines follow position order. Records retain their bodies; clean nodes provide summaries.
 * A missing or dirty node gives a temporary line with the range period and the text of its two
 * children, joined for this render only and cut at the line limit.
 * A catalog leaf uses its clean scope root or a temporary line when that non-empty scope is not ready.
 * An empty scope gives no line. Lines outside selected pairs retain their text.
 * Uncovered live records remain separate lines until a selected fold merges their ranges.
 */
export function slice(tree: Tree, budget: Lines): readonly SliceLine[] {
	const model = new Model(tree);
	return frontier(model, budget).map((range): SliceLine => {
		const period = model.period(range);
		if (range.level === 0) {
			const leaf = model.live(range)[0];
			if (leaf?.record)
				return {
					kind: "record",
					pos: range.start,
					...period,
					body: leaf.record.body,
				};
			const root = leaf?.scope?.root();
			if (root && leaf?.scope?.isClean(root))
				return { kind: "summary", range, ...period, summary: root.summary };
		} else {
			const node = model.node(range);
			if (node && model.isClean(node))
				return { kind: "summary", range, ...period, summary: node.summary };
		}
		return {
			kind: "temporary",
			range,
			...period,
			text: cutAtWord(rangeBody(model, range, LINE_LIMIT), LINE_LIMIT),
		};
	});
}
// #endregion FUNC_slice

// #region FUNC_due
/**
 * @purpose Rank a pair by its age relative to the assigned extent.
 * @invariants Due is (total - (start + 2^(level+1) - 1)) / 2^level, where level is the child level.
 * Total counts assigned positions, so an import that changes total also changes due.
 */
export function due(total: Pos, range: Range): number {
	return (
		(total - (range.start + 2 ** (range.level + 1) - 1)) / 2 ** range.level
	);
}
// #endregion FUNC_due
