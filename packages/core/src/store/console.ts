/**
 * #region moduleContract
 * @purpose Read display lines and build counts without complete note or node rows.
 * @scope Scope counts, review rows, frontier lines, range details, and maintenance counts.
 * Read document text only for a temporary line, within the line character limit.
 * @keywords console, selective, slice, range, counts
 * #endregion moduleContract
 */

import type { DatabaseSync, StatementSync } from "node:sqlite";
import { debuglog } from "node:util";
import { renderAddress } from "../domain/address-form.js";
import { dateSpan } from "../domain/date-span.js";
import type { OpenLine } from "../domain/reads.js";
import {
	cutAtWord,
	foldPositions,
	joinBody,
	LINE_LIMIT,
	lowerBound,
	topRangeOf,
} from "../domain/tree.js";
import type { NoteKind, ScopeKey } from "../types/primitives.js";
import type { Range, SliceLine } from "../types/tree.js";
import type { Store } from "./store.js";
import type { Note } from "./types.js";

const debug = debuglog("memlens:console");

// #region INTERFACE_ScopeCount
/** @purpose Give the note counts of one scope without its content. */
export interface ScopeCount {
	readonly key: ScopeKey;
	readonly total: number;
	readonly live: number;
	readonly hidden: number;
	readonly deleted: number;
}
// #endregion INTERFACE_ScopeCount

// #region FUNC_scopeCounts
/** @purpose Count each note state per scope without note content. */
export function scopeCounts(store: Store): readonly ScopeCount[] {
	const rows = store
		.handle()
		.prepare(`SELECT scope AS key, COUNT(*) AS total,
		SUM(state = 'live') AS live, SUM(state = 'hidden') AS hidden,
		SUM(state = 'deleted') AS deleted FROM notes GROUP BY scope ORDER BY scope`)
		.all() as unknown as ScopeCount[];
	debug("Scope counts read", { scopes: rows.length });
	return rows;
}
// #endregion FUNC_scopeCounts

/** The note fields that a review list needs. */
type ReviewRow = Pick<
	Note,
	"scope" | "pos" | "ts" | "kind" | "body" | "review_at"
>;

// #region FUNC_reviewRows
/** @purpose Read due notes and the next review dates without documents or summary rows. */
export function reviewRows(
	store: Store,
	scope: ScopeKey,
	now: string,
	kind: NoteKind | null,
): {
	readonly due: readonly ReviewRow[];
	readonly next: readonly ReviewRow[];
	readonly nextTotal: number;
} {
	const where =
		"scope = ? AND state = 'live' AND review_at IS NOT NULL" +
		(kind ? " AND kind = ?" : "");
	const args = kind ? [scope, kind, now] : [scope, now];
	const list = (operator: string, limit: string): readonly ReviewRow[] =>
		store
			.handle()
			.prepare(
				`SELECT scope, pos, ts, kind, body, review_at FROM notes WHERE ${where} AND review_at ${operator} ? ORDER BY review_at, pos ${limit}`,
			)
			.all(...args) as unknown as ReviewRow[];
	const total = store
		.handle()
		.prepare(
			`SELECT COUNT(*) AS total FROM notes WHERE ${where} AND review_at > ?`,
		)
		.get(...args);
	const result = {
		due: list("<=", ""),
		next: list(">", "LIMIT 10"),
		nextTotal: Number(total?.total ?? 0),
	};
	debug("Review rows read", {
		scope,
		kind,
		due: result.due.length,
		next: result.next.length,
		total: result.nextTotal,
	});
	return result;
}
// #endregion FUNC_reviewRows

/** The stored keys of a summary, without its text. */
interface NodeKeys {
	readonly level: number;
	readonly start: number;
	readonly built_v: string;
	readonly a_key: string | null;
	readonly b_key: string | null;
}

// #region CLASS_ConsoleReader
/** @purpose Read only the rows and columns that one console scope needs. */
export class ConsoleReader {
	private readonly statements = new Map<string, StatementSync>();
	private readonly nodes = new Map<string, NodeKeys | null>();
	private positions: number[] | undefined;
	private leafKeys: Map<number, string> | undefined;
	private allNodes = false;
	constructor(
		private readonly db: DatabaseSync,
		readonly scope: ScopeKey,
	) {}

	private statement(sql: string): StatementSync {
		let statement = this.statements.get(sql);
		if (!statement) {
			statement = this.db.prepare(sql);
			this.statements.set(sql, statement);
		}
		return statement;
	}

	private total(): number {
		return Number(
			this.statement(
				"SELECT COALESCE(MAX(pos) + 1, 0) AS total FROM notes WHERE scope = ?",
			).get(this.scope)?.total,
		);
	}

	private slots(): number[] {
		this.positions ??= this.statement(
			"SELECT pos FROM notes WHERE scope = ? AND state = 'live' ORDER BY pos",
		)
			.all(this.scope)
			.map((row) => Number(row.pos));
		return this.positions;
	}

	private hasLive(range: Range): boolean {
		const end = range.start + 2 ** range.level;
		if (this.positions)
			return (
				(this.positions[lowerBound(this.positions, range.start)] ?? Infinity) <
				end
			);
		return (
			this.statement(
				"SELECT 1 FROM notes WHERE scope = ? AND pos >= ? AND pos < ? AND state = 'live' LIMIT 1",
			).get(this.scope, range.start, end) !== undefined
		);
	}

	private node(range: Range): NodeKeys | null {
		const key = `${range.level}:${range.start}`;
		if (!this.allNodes && !this.nodes.has(key)) {
			const row = this.statement(
				"SELECT level, start, built_v, a_key, b_key FROM nodes WHERE scope = ? AND level = ? AND start = ?",
			).get(this.scope, range.level, range.start);
			this.nodes.set(key, row ? (row as unknown as NodeKeys) : null);
		}
		return this.nodes.get(key) ?? null;
	}

	private halfValid(range: Range, key: string | null): boolean {
		if (key === null) return !this.hasLive(range);
		if (range.level > 0) return this.node(range)?.built_v === key;
		const actual = this.leafKeys
			? this.leafKeys.get(range.start)
			: this.statement(
					"SELECT v_content || '|' || state AS key FROM notes WHERE scope = ? AND pos = ?",
				).get(this.scope, range.start)?.key;
		return actual === key;
	}

	private valid(node: NodeKeys): boolean {
		const level = node.level - 1;
		return (
			this.halfValid({ start: node.start, level }, node.a_key) &&
			this.halfValid({ start: node.start + 2 ** level, level }, node.b_key)
		);
	}

	private period(
		range: Range,
		end = range.start + 2 ** range.level,
	): { from: string; to: string } {
		const bounds = [this.scope, range.start, end];
		const row = this.statement(`SELECT
			(SELECT ts FROM notes WHERE scope = ? AND pos >= ? AND pos < ? AND state = 'live' ORDER BY pos LIMIT 1) AS first,
			(SELECT ts FROM notes WHERE scope = ? AND pos >= ? AND pos < ? AND state = 'live' ORDER BY pos DESC LIMIT 1) AS last`).get(
			...bounds,
			...bounds,
		);
		return { from: String(row?.first ?? ""), to: String(row?.last ?? "") };
	}

	// #region METHOD_rangeText
	/** @purpose Assemble a temporary line from bounded text reads of its children. */
	private rangeText(range: Range): string {
		if (!this.hasLive(range)) return "";
		if (range.level === 0) {
			// A byte prefix preserves zero characters that SQLite text functions treat as the end.
			const row = this.statement(
				"SELECT substr(CAST(body || CASE WHEN longform IS NOT NULL AND longform != '' THEN char(10) || longform ELSE '' END AS BLOB), 1, ?) AS text FROM notes WHERE scope = ? AND pos = ? AND state = 'live'",
			).get(LINE_LIMIT * 4, this.scope, range.start);
			return row
				? Buffer.from(row.text as Uint8Array)
						.toString("utf8")
						.slice(0, LINE_LIMIT)
				: "";
		}
		const node = this.node(range);
		if (node && this.valid(node))
			return this.summary(range).slice(0, LINE_LIMIT);
		if (!this.allNodes) {
			this.loadNodes();
			this.slots();
		}
		const level = range.level - 1;
		return joinBody(
			this.rangeText({ start: range.start, level }),
			this.rangeText({ start: range.start + 2 ** level, level }),
			LINE_LIMIT,
		);
	}
	// #endregion METHOD_rangeText

	private summary(range: Range): string {
		return String(
			this.statement(
				"SELECT summary FROM nodes WHERE scope = ? AND level = ? AND start = ?",
			).get(this.scope, range.level, range.start)?.summary ?? "",
		);
	}

	// #region METHOD_line
	/** @purpose Read one displayed range with its current text and dates. */
	line(range: Range): SliceLine {
		if (range.level === 0) {
			const note = this.statement(
				"SELECT body, ts FROM notes WHERE scope = ? AND pos = ? AND state = 'live'",
			).get(this.scope, range.start);
			if (note)
				return {
					kind: "record",
					pos: range.start,
					from: String(note.ts),
					to: String(note.ts),
					body: String(note.body),
				};
		}
		const period = this.period(range);
		const node = this.node(range);
		return node && this.valid(node)
			? { kind: "summary", range, ...period, summary: this.summary(range) }
			: {
					kind: "temporary",
					range,
					...period,
					text: cutAtWord(this.rangeText(range), LINE_LIMIT),
				};
	}
	// #endregion METHOD_line

	/** @purpose Count frontier lines without their text. */
	lineCount(budget: number): number {
		return foldPositions(this.slots(), this.total(), budget).length;
	}

	// #region METHOD_slice
	/** @purpose Read the visible frontier lines within the budget. */
	slice(budget: number): readonly SliceLine[] {
		const ranges = foldPositions(this.slots(), this.total(), budget);
		debug("Console lines read", {
			scope: this.scope,
			positions: this.positions?.length,
			lines: ranges.length,
		});
		return ranges.map((range) => this.line(range));
	}
	// #endregion METHOD_slice

	// #region METHOD_top
	/** @purpose Read one scope summary without its complete frontier or documents. */
	top(): SliceLine | null {
		const range = topRangeOf(this.total());
		return range && this.hasLive(range) ? this.line(range) : null;
	}
	// #endregion METHOD_top

	// #region METHOD_children
	/** @purpose Read the two displayed children of a selected range. */
	children(
		start: number,
		end: number,
	): { readonly children: readonly OpenLine[]; readonly text: string } {
		const width = end - start + 1;
		const level = Math.max(1, Math.ceil(Math.log2(width)));
		const range = { start, level };
		if (width !== 2 ** level || start % width !== 0) {
			const period = this.period(range, end + 1);
			const rows = this.statement(
				"SELECT substr(CAST(body || CASE WHEN longform IS NOT NULL AND longform != '' THEN char(10) || longform ELSE '' END AS BLOB), 1, ?) AS text FROM notes WHERE scope = ? AND pos >= ? AND pos <= ? AND state = 'live' ORDER BY pos LIMIT ?",
			).all(LINE_LIMIT * 4, this.scope, start, end, LINE_LIMIT) as unknown as {
				readonly text: Uint8Array;
			}[];
			const joined = cutAtWord(
				rows
					.map((row) =>
						Buffer.from(row.text).toString("utf8").slice(0, LINE_LIMIT),
					)
					.join("; "),
				LINE_LIMIT,
			);
			const text = dateSpan(period.from, period.to);
			return {
				text,
				children:
					rows.length === 0
						? []
						: [
								{
									addr: renderAddress(this.scope, start, null),
									ts_from: period.from,
									ts_to: period.to,
									text: joined,
									built: false,
									chars: joined.length,
								},
							],
			};
		}
		const selected = this.line(range);
		const text =
			selected.kind === "record"
				? selected.body
				: selected.kind === "summary"
					? selected.summary
					: selected.text || dateSpan(selected.from, selected.to);
		const children: OpenLine[] = [];
		for (const half of [
			{ start, level: level - 1 },
			{ start: start + width / 2, level: level - 1 },
		]) {
			if (!this.hasLive(half)) continue;
			const node = half.level > 0 ? this.node(half) : null;
			const clean = node !== null && this.valid(node);
			const row =
				half.level === 0
					? this.statement(
							"SELECT body AS text, ts AS first, ts AS last FROM notes WHERE scope = ? AND pos = ? AND state = 'live'",
						).get(this.scope, half.start)
					: clean
						? this.statement(
								"SELECT summary AS text, ts_from AS first, ts_to AS last FROM nodes WHERE scope = ? AND level = ? AND start = ?",
							).get(this.scope, half.level, half.start)
						: null;
			const period = row
				? { from: String(row.first), to: String(row.last) }
				: this.period(half);
			const text = row
				? String(row.text)
				: half.level > 0
					? cutAtWord(this.rangeText(half), LINE_LIMIT)
					: "";
			children.push({
				addr: renderAddress(
					this.scope,
					half.start,
					half.level === 0 ? null : half.start + 2 ** half.level - 1,
				),
				ts_from: period.from,
				ts_to: period.to,
				text,
				built: row !== null && row !== undefined,
				chars: text.length,
			});
		}
		return { children, text };
	}
	// #endregion METHOD_children

	private loadNodes(): NodeKeys[] {
		if (!this.allNodes) {
			const rows = this.statement(
				"SELECT level, start, built_v, a_key, b_key FROM nodes WHERE scope = ? ORDER BY level, start",
			).all(this.scope) as unknown as NodeKeys[];
			for (const row of rows) this.nodes.set(`${row.level}:${row.start}`, row);
			this.allNodes = true;
		}
		return [...this.nodes.values()].filter(
			(row): row is NodeKeys => row !== null,
		);
	}

	// #region METHOD_maintenance
	/** @purpose Count node validity and candidate ranges without node summaries or note documents. */
	maintenance(): {
		readonly nodes: number;
		readonly levels: {
			level: number;
			nodes: number;
			dirty: number;
			candidates: number;
		}[];
		readonly candidates: Range[];
	} {
		const rows = this.loadNodes();
		if (rows.some((row) => row.level === 1))
			this.leafKeys = new Map(
				this.statement(
					"SELECT pos, v_content || '|' || state AS key FROM notes WHERE scope = ?",
				)
					.all(this.scope)
					.map((row) => [Number(row.pos), String(row.key)]),
			);

		const levels = new Map<
			number,
			{ level: number; nodes: number; dirty: number; candidates: number }
		>();
		const at = (level: number) => {
			let row = levels.get(level);
			if (!row) {
				row = { level, nodes: 0, dirty: 0, candidates: 0 };
				levels.set(level, row);
			}
			return row;
		};
		this.slots();
		for (const row of rows) {
			at(row.level).nodes++;
			if (!this.valid(row)) at(row.level).dirty++;
		}
		const candidates: Range[] = [];
		const top = Math.max(1, Math.ceil(Math.log2(this.total())));
		for (let level = 1; level <= top; level++) {
			let previous = -1;
			for (const pos of this.slots()) {
				const start = Math.floor(pos / 2 ** level) * 2 ** level;
				if (start === previous) continue;
				previous = start;
				const node = this.node({ start, level });
				if (!node || !this.valid(node)) {
					candidates.push({ start, level });
					at(level).candidates++;
				}
			}
		}
		return {
			nodes: rows.length,
			levels: [...levels.values()].sort((a, b) => a.level - b.level),
			candidates,
		};
	}
	// #endregion METHOD_maintenance
}
// #endregion CLASS_ConsoleReader
