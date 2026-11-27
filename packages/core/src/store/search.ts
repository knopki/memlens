/**
 * #region moduleContract
 * @modulecontract
 * @purpose Find the live notes that match one find filter, so each caller reads one index with one grammar.
 * @scope
 *  - The find filter, the match expression, the FTS query, the literal fallback scan, and the hit order.
 *  - NOT: The scope check of a caller, and the tool schemas.
 * @invariants
 *  - A hidden, deleted, or cleared row gives no hit.
 *  - Each filter cuts the rows before the limit.
 *  - No log holds the query text or a note text.
 * @dependencies USES API: node:sqlite
 * @keywords search, find, filter, fts5, match, prefix, exclusion, trigram, literal, scan, rank, hit
 * #endregion moduleContract
 */

import type { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import { renderAddress } from "../domain/address-form.js";
import type { IsoTime, NoteKind, ScopeKey } from "../types/primitives.js";
import type { Store } from "./store.js";
import type { IndexHit } from "./types.js";

const debug = debuglog("memlens:search");

/** The filters of one find. A null or absent field imposes no limit. */
export interface FindFilter {
	readonly query?: string | null;
	readonly scopes?: readonly ScopeKey[] | null;
	readonly since?: string | null;
	readonly until?: string | null;
	readonly kinds?: readonly NoteKind[] | null;
	readonly due?: boolean;
	readonly limit?: number;
}

/** The default limit of a find. */
export const FIND_DEFAULT_LIMIT = 10;

/** The greatest limit of a find. A caller that asks for more gets this many hits at most. */
export const FIND_MAX_LIMIT = 50;

/** The note columns of one hit. */
const HIT_COLUMNS =
	"n.id, n.scope, n.pos, n.ts, n.kind, n.body, n.longform, n.review_at";

/** The WHERE tail of the filters, with the values of its placeholders. */
interface SqlTail {
	readonly clause: string;
	readonly args: readonly (string | number)[];

	/** The count of the named scopes. A zero count means each scope. */
	readonly scopes: number;
}

/** The parts of one query. */
interface Query {
	/** True when the query holds no word. */
	readonly empty: boolean;

	/** The FTS5 expression, or null when no positive word exists. */
	readonly expr: string | null;

	/** The positive words, in query order. */
	readonly positive: readonly string[];

	/** The count of exclusion words. */
	readonly excluded: number;
}

// #region FUNC_parseQuery
/**
 * @purpose Read the tool query with one grammar, so no query word injects FTS5 syntax.
 * @invariants Split the query on whitespace. Quote each word as one phrase and put the star outside.
 * @invariants Each positive word matches each token that starts with the word. A leading minus excludes.
 * @invariants A leading minus makes one exclusion. A query with no positive word gives a null expression.
 * @ensures The expression holds only quoted phrases, so no word injects FTS5 syntax.
 */
function parseQuery(query: string): Query {
	const words = query.split(/\s+/).filter(Boolean);
	const required: string[] = [];
	const excluded: string[] = [];
	const positive: string[] = [];
	for (const word of words) {
		const phrase = `"${word.replaceAll('"', '""')}"*`;
		if (word.startsWith("-") && word.length > 1) excluded.push(phrase);
		else {
			required.push(phrase);
			positive.push(word);
		}
	}
	let expr: string | null = null;
	if (required.length) {
		const group = `(${required.join(" AND ")})`;
		expr = excluded.length ? `${group} NOT (${excluded.join(" OR ")})` : group;
	}
	debug("Query parsed", {
		event: "parse",
		words: words.length,
		required: required.length,
		excluded: excluded.length,
	});
	return {
		empty: words.length === 0,
		expr,
		positive,
		excluded: excluded.length,
	};
}
// #endregion FUNC_parseQuery

// #region FUNC_literalWord
/**
 * @purpose Keep a short CJK word searchable when the trigram index cannot match it.
 * @invariants The fallback needs a trigram tokenizer and a positive word under three characters.
 * @returns The shortest positive word, or null when the FTS path applies.
 */
function literalWord(
	tokenizer: string,
	positive: readonly string[],
): string | null {
	if (!tokenizer.includes("trigram")) return null;
	let shortest: string | null = null;
	for (const word of positive)
		if (word.length < 3 && (shortest === null || word.length < shortest.length))
			shortest = word;
	return shortest;
}
// #endregion FUNC_literalWord

function likePattern(word: string): string {
	const escaped = word.replace(/[\\%_]/g, (char) => `\\${char}`);
	return `%${escaped}%`;
}

// #region FUNC_hitsFromRows
/**
 * @purpose Build each hit in one place, so each query path gives the same hit shape.
 * @invariants The address holds the scope of the row. A null or empty review time gives null.
 */
function hitsFromRows(
	rows: readonly Record<string, unknown>[],
): readonly IndexHit[] {
	return rows.map((row) => {
		const scope = String(row.scope) as ScopeKey;
		const pos = Number(row.pos);
		const longform = row.longform === null ? null : String(row.longform);
		const review = row.review_at;
		return {
			addr: renderAddress(scope, pos, null),
			scope,
			pos,
			id: String(row.id),
			ts: String(row.ts),
			kind: String(row.kind) as NoteKind,
			body: String(row.body),
			longformChars: longform?.length ?? 0,
			review_at:
				review === null || review === undefined || review === ""
					? null
					: String(review),
		};
	});
}
// #endregion FUNC_hitsFromRows

// #region FUNC_dayBounds
/**
 * @purpose Give the UTC start and the exclusive UTC end of one day in the zone of the process.
 * @invariants A text that is not a day, or a day that the calendar of the zone does not hold, gives null.
 */
function dayBounds(day: string): { start: string; end: string } | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
	if (match === null) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const date = Number(match[3]);
	const start = new Date(year, month - 1, date);
	if (
		start.getFullYear() !== year ||
		start.getMonth() !== month - 1 ||
		start.getDate() !== date
	)
		return null;
	return {
		start: start.toISOString(),
		end: new Date(year, month - 1, date + 1).toISOString(),
	};
}
// #endregion FUNC_dayBounds

// #region FUNC_filterSql
/**
 * @purpose Give the filter tail of each query path, so each filter cuts the rows before the limit.
 * @invariants A null or empty list imposes no limit.
 * @invariants A day bound covers that whole day in the zone of the process. Another bound compares
 * the text prefix of the time.
 * @invariants A due row has a review time of now or earlier.
 */
function filterSql(filter: FindFilter, now: IsoTime): SqlTail {
	const clause: string[] = [];
	const args: (string | number)[] = [];
	const list = (column: string, values: readonly string[]) => {
		if (values.length === 0) return;
		clause.push(`${column} IN (${values.map(() => "?").join(", ")})`);
		args.push(...values);
	};
	const scopes = filter.scopes ?? [];
	list("n.scope", scopes);
	list("n.kind", filter.kinds ?? []);
	const since = filter.since ?? "";
	const until = filter.until ?? "";
	const start = dayBounds(since);
	const end = dayBounds(until);
	if (since.length > 0) {
		clause.push(start === null ? "substr(n.ts, 1, ?) >= ?" : "n.ts >= ?");
		args.push(...(start === null ? [since.length, since] : [start.start]));
	}
	if (until.length > 0) {
		clause.push(end === null ? "substr(n.ts, 1, ?) <= ?" : "n.ts < ?");
		args.push(...(end === null ? [until.length, until] : [end.end]));
	}
	if (filter.due === true) {
		clause.push(
			"n.review_at IS NOT NULL AND n.review_at <> '' AND n.review_at <= ?",
		);
		args.push(now);
	}
	return {
		clause: clause.map((item) => ` AND ${item}`).join(""),
		args,
		scopes: scopes.length,
	};
}
// #endregion FUNC_filterSql

// #region FUNC_search
/**
 * @purpose Give the hits of one find, so the tools, the CLI, and the console share one answer.
 * @invariants Each filter cuts the rows before the limit. The order is by rank, then the newest ts,
 * then scope, then id.
 * @invariants An empty query lists each matching live row in the ts order. An exclusion-only query
 * gives no hit.
 * @invariants A trigram index with a short positive word uses a bounded literal containment scan.
 * @invariants A negative limit gives no hit. The default limit is 10. Each answer holds at most
 * FIND_MAX_LIMIT hits.
 * @returns The hits, at most the limit.
 */
export function search(
	store: Store,
	filter: FindFilter,
	now: IsoTime,
): readonly IndexHit[] {
	const db = store.handle();
	const limit = Math.min(
		FIND_MAX_LIMIT,
		Math.max(0, filter.limit ?? FIND_DEFAULT_LIMIT),
	);
	const tail = filterSql(filter, now);
	const parsed = parseQuery(filter.query ?? "");
	if (parsed.empty) return searchAll(db, tail, limit);
	if (parsed.expr === null) {
		debug("Search refused", {
			event: "search",
			path: "none",
			hits: 0,
			scopes: tail.scopes,
			limit,
			excluded: parsed.excluded,
		});
		return [];
	}
	const tokenizer = store.meta("fts_tokenizer") ?? "";
	const word = literalWord(tokenizer, parsed.positive);
	return word !== null
		? literalScan(db, word, tail, limit)
		: searchFts(db, parsed.expr, tail, limit);
}
// #endregion FUNC_search

// #region FUNC_searchAll
/** @purpose List each live row in the ts order, so an empty query shows the newest notes. */
function searchAll(
	db: DatabaseSync,
	tail: SqlTail,
	limit: number,
): readonly IndexHit[] {
	const hits = hitsFromRows(
		db
			.prepare(
				`SELECT ${HIT_COLUMNS} FROM notes n
				WHERE n.state = 'live' AND n.cleared = 0${tail.clause}
				ORDER BY n.ts DESC, n.scope, n.id
				LIMIT ?`,
			)
			.all(...tail.args, limit),
	);
	debug("Search listed", {
		event: "search",
		path: "all",
		hits: hits.length,
		scopes: tail.scopes,
		limit,
	});
	return hits;
}
// #endregion FUNC_searchAll

// #region FUNC_searchFts
/** @purpose Match the query through the index and give the hits in rank order. */
function searchFts(
	db: DatabaseSync,
	expr: string,
	tail: SqlTail,
	limit: number,
): readonly IndexHit[] {
	const hits = hitsFromRows(
		db
			.prepare(
				`SELECT ${HIT_COLUMNS}
				FROM fts JOIN notes n ON n.n = fts.rowid
				WHERE fts MATCH ? AND n.state = 'live' AND n.cleared = 0${tail.clause}
				ORDER BY rank, n.ts DESC, n.scope, n.id
				LIMIT ?`,
			)
			.all(expr, ...tail.args, limit),
	);
	debug("Search matched", {
		event: "search",
		path: "fts",
		hits: hits.length,
		scopes: tail.scopes,
		limit,
	});
	return hits;
}
// #endregion FUNC_searchFts

// #region FUNC_literalScan
/**
 * @purpose Find a short word without the index, so a zh or ja query still gives an answer.
 * @invariants The test is literal containment of the text. No tokenizer and no exclusion word applies.
 * @invariants The scan is bounded by the limit and applies each filter in SQL.
 * @invariants The LIKE pattern escapes the percent, the underscore, and the backslash.
 */
function literalScan(
	db: DatabaseSync,
	word: string,
	tail: SqlTail,
	limit: number,
): readonly IndexHit[] {
	const pattern = likePattern(word);
	const hits = hitsFromRows(
		db
			.prepare(
				`SELECT ${HIT_COLUMNS} FROM notes n
				WHERE n.state = 'live' AND n.cleared = 0
					AND (n.body LIKE ? ESCAPE '\\' OR n.longform LIKE ? ESCAPE '\\')${tail.clause}
				ORDER BY n.ts DESC, n.scope, n.id
				LIMIT ?`,
			)
			.all(pattern, pattern, ...tail.args, limit),
	);
	debug("Search scanned", {
		event: "search",
		path: "literal",
		hits: hits.length,
		scopes: tail.scopes,
		limit,
		wordChars: word.length,
	});
	return hits;
}
// #endregion FUNC_literalScan
