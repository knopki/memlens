/**
 * #region moduleContract
 * @modulecontract
 * @purpose Find the live notes that match a query, so each caller reads one index with one grammar.
 * @scope The match expression, the FTS query, the literal fallback scan, and the hit order.
 * @invariants A hidden, deleted, or cleared row gives no hit.
 * @invariants No log holds the query text or a note text.
 * @dependencies USES API: node:sqlite
 * @keywords search, fts5, match, prefix, exclusion, trigram, literal, scan, rank, hit
 * #endregion moduleContract
 */

import type { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import { renderAddress } from "../domain/address-form.js";
import type { NoteKind, ScopeKey } from "../types/primitives.js";
import type { Store } from "./store.js";
import type { IndexHit } from "./types.js";

const debug = debuglog("memlens:search");

/** The note columns of one hit. */
const HIT_COLUMNS = "id, scope, pos, ts, kind, body, longform, review_at";

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

// #region FUNC_search
/**
 * @purpose Give the hits of one query, so the tools and the CLI share one answer.
 * @invariants Apply the scope filter in SQL. Order by rank, then the newest ts, then scope, then id.
 * @invariants An empty query lists each live row in the ts order. An exclusion-only query gives no hit.
 * @invariants A trigram index with a short positive word uses a bounded literal containment scan.
 * @returns The hits, at most the given limit.
 */
export function search(
	store: Store,
	query: string,
	scope: ScopeKey | null,
	limit: number,
): readonly IndexHit[] {
	const db = store.handle();
	const cap = Math.max(0, limit);
	const parsed = parseQuery(query);
	if (parsed.empty) return searchAll(db, scope, cap);
	if (parsed.expr === null) {
		debug("Search refused", {
			event: "search",
			path: "none",
			hits: 0,
			scope,
			limit: cap,
			excluded: parsed.excluded,
		});
		return [];
	}
	const tokenizer = store.meta("fts_tokenizer") ?? "";
	const word = literalWord(tokenizer, parsed.positive);
	return word !== null
		? literalScan(db, word, scope, cap)
		: searchFts(db, parsed, scope, cap);
}
// #endregion FUNC_search

// #region FUNC_searchAll
/** @purpose List each live row in the ts order, so an empty query shows the newest notes. */
function searchAll(
	db: DatabaseSync,
	scope: ScopeKey | null,
	limit: number,
): readonly IndexHit[] {
	const hits = hitsFromRows(
		db
			.prepare(
				`SELECT ${HIT_COLUMNS} FROM notes
				WHERE state = 'live' AND cleared = 0${scope === null ? "" : " AND scope = ?"}
				ORDER BY ts DESC, scope, id
				LIMIT ?`,
			)
			.all(...(scope === null ? [limit] : [scope, limit])),
	);
	debug("Search listed", {
		event: "search",
		path: "all",
		hits: hits.length,
		scope,
		limit,
	});
	return hits;
}
// #endregion FUNC_searchAll

// #region FUNC_searchFts
/** @purpose Match the query through the index and give the hits in rank order. */
function searchFts(
	db: DatabaseSync,
	parsed: Query,
	scope: ScopeKey | null,
	limit: number,
): readonly IndexHit[] {
	const expr = parsed.expr ?? "";
	const hits = hitsFromRows(
		db
			.prepare(
				`SELECT n.id, n.scope, n.pos, n.ts, n.kind, n.body, n.longform, n.review_at
				FROM fts JOIN notes n ON n.n = fts.rowid
				WHERE fts MATCH ? AND n.state = 'live' AND n.cleared = 0${scope === null ? "" : " AND n.scope = ?"}
				ORDER BY rank, n.ts DESC, n.scope, n.id
				LIMIT ?`,
			)
			.all(...(scope === null ? [expr, limit] : [expr, scope, limit])),
	);
	debug("Search matched", {
		event: "search",
		path: "fts",
		hits: hits.length,
		scope,
		limit,
		required: parsed.positive.length,
		excluded: parsed.excluded,
	});
	return hits;
}
// #endregion FUNC_searchFts

// #region FUNC_literalScan
/**
 * @purpose Find a short word without the index, so a zh or ja query still gives an answer.
 * @invariants The test is literal containment of the text. No tokenizer and no exclusion word applies.
 * @invariants The scan is bounded by the limit and applies the scope filter in SQL.
 * @invariants The LIKE pattern escapes the percent, the underscore, and the backslash.
 */
function literalScan(
	db: DatabaseSync,
	word: string,
	scope: ScopeKey | null,
	limit: number,
): readonly IndexHit[] {
	const pattern = likePattern(word);
	const args: (string | number)[] = [pattern, pattern];
	if (scope !== null) args.push(scope);
	args.push(limit);
	const hits = hitsFromRows(
		db
			.prepare(
				`SELECT ${HIT_COLUMNS} FROM notes
				WHERE state = 'live' AND cleared = 0
					AND (body LIKE ? ESCAPE '\\' OR longform LIKE ? ESCAPE '\\')${scope === null ? "" : " AND scope = ?"}
				ORDER BY ts DESC, scope, id
				LIMIT ?`,
			)
			.all(...args),
	);
	debug("Search scanned", {
		event: "search",
		path: "literal",
		hits: hits.length,
		scope,
		limit,
		wordChars: word.length,
	});
	return hits;
}
// #endregion FUNC_literalScan
