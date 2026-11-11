/**
 * #region moduleContract
 * @purpose Keep search results complete and identical across both backends through one FTS5 engine.
 * @scope
 *  - The query grammar, the tokenizer choice, the row lifecycle, and the rebuild from events.
 *  - NOT: locks, transactions, files, and the store lifecycle. The backend owns them.
 * @invariants
 *  - The table holds one row for each live record with no cleared content.
 *  - A hidden, deleted, or cleared record has no row, so no answer returns it or its text.
 *  - Each query word matches any token that starts with it, so one word form finds its inflections,
 *    and a word with a leading minus keeps each such record out.
 *  - A query with exclusion words only gives no hit. An empty query matches each row.
 *  - The tokenizer is porter unicode61 remove_diacritics 1, and trigram for zh and ja.
 *  - The meta table records the language of the build. A change of the language drops the table.
 *  - A rebuild derives the rows from the events through the projection. The log is the only truth.
 *  - Search orders by rank, then the newest ts, then scope, then the greatest pos.
 *  - Logs hold no note and no summary content.
 * @dependencies
 *  USES API: node:sqlite, domain/projection.ts
 *  READS: ProjectionRecord, JsonlLine
 *  WRITES: the hits table and the index_meta table of the given database
 * @keywords fts5, index, search, tokenizer, porter, trigram, hit, rank, rebuild
 * #endregion moduleContract
 */

import type { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import { renderAddress } from "../domain/address.js";
import { project } from "../domain/projection.js";
import type { JsonlLine, NoteKind, ScopeKey, Ulid } from "../types/events.js";
import type { ProjectionRecord } from "../types/projection.js";
import type { IndexHit, IndexPort } from "../types/store.js";

const debug = debuglog("memlens:fts");
const TOKENIZERS: Record<string, string> = {
	zh: "trigram",
	ja: "trigram",
};

// #region FUNC_matchExpr
/**
 * @purpose Turn the tool query into one FTS5 match expression, so both backends read one grammar.
 * @invariants Split the query on whitespace. Each positive word matches any token that starts with
 * it. A leading minus makes an exclusion by the same prefix rule.
 * @invariants Quote each word as one phrase and put the star outside the quotes, so no word injects
 * FTS5 syntax and a typed star stays inert text. An exclusion-only query gives null.
 * @returns The match expression, or null when no positive word can match.
 */
function matchExpr(query: string): string | null {
	const words = query.split(/\s+/).filter(Boolean);
	const required: string[] = [];
	const excluded: string[] = [];
	for (const word of words) {
		const phrase = `"${word.replaceAll('"', '""')}"*`;
		(word.startsWith("-") && word.length > 1 ? excluded : required).push(
			phrase,
		);
	}
	if (!required.length) return null;
	debug("Query grammar", {
		event: "grammar",
		required: required.length,
		excluded: excluded.length,
	});
	const expr = `(${required.join(" AND ")})`;
	return excluded.length ? `${expr} NOT (${excluded.join(" OR ")})` : expr;
}
// #endregion FUNC_matchExpr

// #region CLASS_FtsIndex
/**
 * @purpose Give both store backends one index implementation with identical hits and ordering.
 * @invariants The caller owns the database handle and the surrounding lock or transaction.
 * @invariants The mount methods create the schema and detect a tokenizer change before any query.
 */
export class FtsIndex implements IndexPort {
	/**
	 * @purpose Bind the engine to a language and to the database handle supplier of one backend.
	 * @param language - The configured index language. Only zh and ja select the trigram tokenizer.
	 * @param connect - Opens the database that holds the index tables.
	 * @param release - Closes the handle after each port call. The default keeps it open.
	 */
	constructor(
		private readonly language: string,
		private readonly connect: () => DatabaseSync,
		private readonly release: (db: DatabaseSync) => void = () => {},
	) {}

	/** @purpose Add the current record with its metadata and longform. Part of the source transaction. */
	async add(record: ProjectionRecord): Promise<void> {
		this.within((db) => {
			this.mount(db);
			this.upsert(db, record);
		});
	}

	/** @purpose Remove one record from the index. */
	async remove(id: Ulid): Promise<void> {
		this.within((db) => {
			this.mount(db);
			this.delete(db, id);
		});
	}

	/** @purpose Search the index for the given query. Return complete hits with each longform length. */
	async search(
		query: string,
		scope: ScopeKey | null,
		limit: number,
	): Promise<readonly IndexHit[]> {
		return this.within((db) => this.query(db, query, scope, limit));
	}

	/** @purpose Rebuild the index from the given events. Called after a language change or index loss. */
	async rebuild(events: readonly JsonlLine[]): Promise<void> {
		this.within((db) => {
			this.mount(db);
			this.replaceRows(db, project(events).records.values());
		});
	}

	/** @purpose Close the index. The caller owns each handle, so this releases nothing. */
	async close(): Promise<void> {}

	// #region METHOD_mount
	/**
	 * @purpose Create the schema when absent and detect a tokenizer change before any query.
	 * @invariants A missing or changed meta language recreates the table with the configured tokenizer.
	 * @returns True when the caller must rebuild the rows, because the table is new or dropped.
	 */
	mount(db: DatabaseSync): boolean {
		db.exec(
			"CREATE TABLE IF NOT EXISTS index_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
		);
		const row = db
			.prepare("SELECT value FROM index_meta WHERE key = 'language'")
			.get() as { value: string } | undefined;
		if (row?.value === this.language) return false;
		if (row) db.exec("DROP TABLE IF EXISTS hits");
		db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS hits USING fts5(
			body, longform,
			id UNINDEXED, scope UNINDEXED, pos UNINDEXED, ts UNINDEXED,
			kind UNINDEXED, review_at UNINDEXED, longform_chars UNINDEXED,
			tokenize = '${TOKENIZERS[this.language] ?? "porter unicode61 remove_diacritics 1"}'
		)`);
		db.prepare("INSERT OR REPLACE INTO index_meta VALUES ('language', ?)").run(
			this.language,
		);
		debug("Index language set", { event: "language", language: this.language });
		return true;
	}
	// #endregion METHOD_mount

	/** @purpose Report whether the schema exists and matches the configured tokenizer. */
	ready(db: DatabaseSync): boolean {
		const row = db
			.prepare("SELECT value FROM index_meta WHERE key = 'language'")
			.get() as { value: string } | undefined;
		return row?.value === this.language;
	}

	// #region METHOD_replaceRows
	/**
	 * @purpose Rebuild each row from the projected records inside one caller transaction.
	 * @invariants Only live records without cleared content enter the table.
	 */
	replaceRows(db: DatabaseSync, records: Iterable<ProjectionRecord>): void {
		db.exec("DELETE FROM hits");
		let rows = 0;
		for (const record of records)
			if (record.state === "live" && !record.content_cleared) {
				this.insert(db, record);
				rows += 1;
			}
		debug("Index rebuilt", { event: "rebuild", rows });
	}
	// #endregion METHOD_replaceRows

	// #region METHOD_syncRows
	/**
	 * @purpose Apply one published plan to the rows inside the caller transaction.
	 * @invariants Each touched id takes its current record row, or loses its row when it is not live.
	 */
	syncRows(
		db: DatabaseSync,
		touched: readonly string[],
		records: ReadonlyMap<Ulid, ProjectionRecord>,
	): void {
		for (const id of touched) {
			const record = records.get(id);
			if (record && record.state === "live" && !record.content_cleared)
				this.upsert(db, record);
			else this.delete(db, id);
		}
		debug("Index rows synced", { event: "sync", touched: touched.length });
	}
	// #endregion METHOD_syncRows

	// #region METHOD_query
	/**
	 * @purpose Return complete hits for one query with a deterministic order across backends.
	 * @invariants Apply the scope filter in SQL. Order by rank, then the newest ts, then scope, then pos.
	 */
	query(
		db: DatabaseSync,
		query: string,
		scope: ScopeKey | null,
		limit: number,
	): readonly IndexHit[] {
		const expr = matchExpr(query);
		if (expr === null && query.trim().length > 0) {
			debug("Index search", { event: "search", hits: 0, empty: true });
			return [];
		}
		const where: string[] = [];
		const args: (string | number | null)[] = [];
		if (expr !== null) {
			where.push("hits MATCH ?");
			args.push(expr);
		}
		if (scope !== null) {
			where.push("scope = ?");
			args.push(scope);
		}
		args.push(Math.max(0, limit));
		const order = expr !== null ? "rank, " : "";
		const rows = db
			.prepare(
				`SELECT id, scope, pos, ts, kind, review_at, body, longform_chars FROM hits
				${where.length ? `WHERE ${where.join(" AND ")}` : ""}
				ORDER BY ${order}ts DESC, scope, pos DESC
				LIMIT ?`.replace(/\s+/g, " "),
			)
			.all(...args) as Record<string, unknown>[];
		const hits = rows.map((row) => ({
			addr: renderAddress(String(row.scope) as ScopeKey, Number(row.pos), null),
			scope: String(row.scope) as ScopeKey,
			pos: Number(row.pos),
			id: String(row.id),
			ts: String(row.ts),
			kind: String(row.kind) as NoteKind,
			body: String(row.body),
			longformChars: Number(row.longform_chars),
			review_at:
				row.review_at === null || row.review_at === ""
					? null
					: String(row.review_at),
		}));
		debug("Index search", { event: "search", hits: hits.length, scope, limit });
		return hits;
	}
	// #endregion METHOD_query

	private within<T>(work: (db: DatabaseSync) => T): T {
		const db = this.connect();
		try {
			return work(db);
		} finally {
			this.release(db);
		}
	}

	private upsert(db: DatabaseSync, record: ProjectionRecord): void {
		if (record.state === "live" && !record.content_cleared) {
			this.delete(db, record.id);
			this.insert(db, record);
		} else this.delete(db, record.id);
	}

	private insert(db: DatabaseSync, record: ProjectionRecord): void {
		db.prepare(
			"INSERT INTO hits (body, longform, id, scope, pos, ts, kind, review_at, longform_chars) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		).run(
			record.body,
			record.longform ?? "",
			record.id,
			record.scope,
			record.pos,
			record.ts,
			record.kind,
			record.review_at ?? "",
			record.longform?.length ?? 0,
		);
	}

	private delete(db: DatabaseSync, id: Ulid): void {
		db.prepare("DELETE FROM hits WHERE id = ?").run(id);
	}
}
// #endregion CLASS_FtsIndex
