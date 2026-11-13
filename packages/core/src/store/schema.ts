/**
 * #region moduleContract
 * @purpose Create and open the one database that holds the memory.
 * @scope Pragmas, the schema, the schema version, and the meta rows. NOT: reads and writes.
 * @invariants Every connection sets secure_delete, busy_timeout, and temp_store.
 * @invariants The index carries the FTS5 secure-delete option, so a delete removes its tokens.
 * @invariants The meta rows hold schema_version, store_id, clock, and fts_tokenizer.
 * @dependencies store/clock.ts for the store identity.
 * @keywords schema, open, pragma, database, migration, version
 * #endregion moduleContract
 */

import { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";
import { storeId } from "./clock.js";

const debug = debuglog("memlens:schema");

/** The schema version of this build. */
export const SCHEMA_VERSION = 2;

/** The table names of the schema. The check command compares this list with the database. */
export const TABLES = [
	"meta",
	"notes",
	"nodes",
	"proposals",
	"journal",
	"fts",
] as const;

const TOKENIZERS: Record<string, string> = {
	zh: "trigram",
	ja: "trigram",
};

// #region FUNC_tokenizerOf

/** @purpose Name the FTS5 tokenizer of a language. Only zh and ja use trigram. */
export function tokenizerOf(language: string): string {
	return TOKENIZERS[language] ?? "porter unicode61 remove_diacritics 1";
}

// #endregion FUNC_tokenizerOf

// #region FUNC_openDatabase

/**
 * @purpose Open one database file with the required settings and the schema.
 * @invariants The open refuses an old event-store database and names the action.
 * @invariants The schema and the meta rows are ready before the caller reads.
 */
export function openDatabase(path: string, language: string): DatabaseSync {
	const db = new DatabaseSync(path);
	try {
		db.exec(
			"PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA secure_delete = ON; PRAGMA busy_timeout = 5000; PRAGMA temp_store = MEMORY;",
		);
		if (legacy(db))
			throw new MemlensError(
				"Data",
				"This store holds an event log. Move the store directory away and start a new store.",
			);
		db.exec("BEGIN IMMEDIATE");
		try {
			create(db, language);
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
		debug("Store open", {
			event: "open",
			version: SCHEMA_VERSION,
			language,
		});
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}

// #endregion FUNC_openDatabase

/** @purpose Refuse a database that holds the event store of the earlier schema. */
function legacy(db: DatabaseSync): boolean {
	const row = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('events', 'state')",
		)
		.get();
	return row !== undefined;
}

// #region FUNC_create

/**
 * @purpose Create each table and seed the meta rows of a new or an open database.
 * @invariants The call is idempotent, so a later open keeps each stored value.
 */
export function create(db: DatabaseSync, language: string): void {
	const tokenizer = tokenizerOf(language);
	db.exec(`
		CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
		CREATE TABLE IF NOT EXISTS notes (
			n             INTEGER PRIMARY KEY,
			id            TEXT NOT NULL UNIQUE,
			scope         TEXT NOT NULL,
			pos           INTEGER NOT NULL,
			state         TEXT NOT NULL CHECK (state IN ('live','hidden','deleted')),
			cleared       INTEGER NOT NULL DEFAULT 0 CHECK (cleared IN (0,1)),
			kind          TEXT NOT NULL CHECK (kind IN ('decision','preference','fact','task','note')),
			body          TEXT NOT NULL DEFAULT '',
			longform      TEXT,
			refs          TEXT NOT NULL DEFAULT '[]',
			superseded_by TEXT,
			ts            TEXT NOT NULL,
			created_at    TEXT NOT NULL,
			modified_at   TEXT NOT NULL,
			review_at     TEXT,
			reviewed_at   TEXT,
			session       TEXT NOT NULL DEFAULT '',
			turn          TEXT NOT NULL DEFAULT '',
			preset        TEXT NOT NULL DEFAULT '',
			v             TEXT NOT NULL,
			v_content     TEXT NOT NULL,
			v_review      TEXT,
			CHECK (cleared = 0 OR (state = 'deleted' AND body = '' AND longform IS NULL)),
			UNIQUE (scope, pos)
		);
		CREATE INDEX IF NOT EXISTS notes_dedupe ON notes (scope, body) WHERE state = 'live';
		CREATE INDEX IF NOT EXISTS notes_due ON notes (review_at)
			WHERE state = 'live' AND review_at IS NOT NULL;
		CREATE TABLE IF NOT EXISTS nodes (
			scope   TEXT NOT NULL,
			level   INTEGER NOT NULL CHECK (level >= 1),
			start   INTEGER NOT NULL CHECK (start % (1 << level) = 0),
			summary TEXT NOT NULL,
			ts_from TEXT NOT NULL,
			ts_to   TEXT NOT NULL,
			built_v TEXT NOT NULL,
			a_key   TEXT,
			b_key   TEXT,
			PRIMARY KEY (scope, level, start)
		) WITHOUT ROWID;
		CREATE TABLE IF NOT EXISTS proposals (
			id         TEXT PRIMARY KEY,
			scope      TEXT NOT NULL,
			op         TEXT NOT NULL,
			target     TEXT,
			payload    TEXT NOT NULL,
			created_at TEXT NOT NULL,
			expires_at TEXT NOT NULL,
			closed     INTEGER NOT NULL DEFAULT 0,
			CHECK (closed = 0 OR payload = '')
		) WITHOUT ROWID;
		CREATE TABLE IF NOT EXISTS journal (
			seq    INTEGER PRIMARY KEY AUTOINCREMENT,
			at     TEXT NOT NULL,
			store  TEXT NOT NULL,
			op     TEXT NOT NULL,
			target TEXT,
			scope  TEXT,
			reason TEXT CHECK (reason IS NULL OR length(reason) <= 200)
		);
		CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
			body, longform,
			content = 'notes', content_rowid = 'n',
			tokenize = '${tokenizer}'
		);
		INSERT INTO fts(fts, rank) VALUES ('secure-delete', 1);
	`);
	const meta = db.prepare(
		"INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)",
	);
	meta.run("schema_version", String(SCHEMA_VERSION));
	meta.run("store_id", storeId());
	const row = db
		.prepare("SELECT value FROM meta WHERE key = 'fts_tokenizer'")
		.get();
	if (row === undefined) meta.run("fts_tokenizer", tokenizer);
	debug("Schema ready", { event: "create", tokenizer });
}

// #endregion FUNC_create
