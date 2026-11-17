/**
 * #region moduleContract
 * @modulecontract
 * @purpose Create and open the one database that holds the memory.
 * @scope Pragmas, the schema, the schema version, and the meta rows. NOT: reads and writes.
 * @invariants Every connection sets secure_delete, busy_timeout, and temp_store.
 * @invariants The index carries the FTS5 secure-delete option, so a delete removes its tokens.
 * @invariants The meta rows hold schema_version, store_id, clock, and fts_tokenizer.
 * @invariants Schema changes and their version updates commit in one transaction.
 * @dependencies store/clock.ts for the store identity.
 * @keywords schema, open, pragma, database, migration, version
 * #endregion moduleContract
 */

import { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";
import { storeId } from "./clock.js";

const debug = debuglog("memlens:schema");

const BASE_SCHEMA_VERSION = 2;

/** Keep the base schema fixed. Add each later schema change to this list in order. */
const MIGRATIONS: ReadonlyArray<(db: DatabaseSync) => void> = [widenKindCheck];

/** The schema version of this build. */
export const SCHEMA_VERSION = BASE_SCHEMA_VERSION + MIGRATIONS.length;

// #region FUNC_widenKindCheck
/**
 * @purpose Widen the kind check of the notes table, so that a note takes the gotcha kind.
 * @invariants SQLite cannot change a check on a column, so the step adds the column beside it, copies
 *   the values, drops the old column, and renames the new one. The table keeps its rows and its
 *   `n`, so the content row of the search index keeps its target.
 * @invariants The kind then holds the default `note`, as each write path defaults it.
 */
function widenKindCheck(db: DatabaseSync): void {
	db.exec(`
		ALTER TABLE notes ADD COLUMN kind_next TEXT NOT NULL DEFAULT 'note'
			CHECK (kind_next IN ('decision','preference','fact','gotcha','task','note'));
		UPDATE notes SET kind_next = kind;
		ALTER TABLE notes DROP COLUMN kind;
		ALTER TABLE notes RENAME COLUMN kind_next TO kind;
	`);
}
// #endregion FUNC_widenKindCheck

const TOKENIZERS: Record<string, string> = {
	zh: "trigram",
	ja: "trigram",
};

/** The schema text. The tokenizer placeholder is replaced at open. */
const SCHEMA_SQL = `
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
			tokenize = '{tokenizer}'
		);
		INSERT INTO fts(fts, rank) VALUES ('secure-delete', 1);
	`;

// #region FUNC_tokenizerOf
/** @purpose Name the FTS5 tokenizer of a language. Only zh and ja use trigram. */
function tokenizerOf(language: string): string {
	return TOKENIZERS[language] ?? "porter unicode61 remove_diacritics 1";
}
// #endregion FUNC_tokenizerOf

// #region FUNC_openDatabase
/**
 * @purpose Open one database file with the required settings and the schema.
 * @invariants The open rejects an unknown schema version before it changes the file.
 * @invariants The open sets the journal mode before the schema work. A step that renames a table in
 *   a rollback-journal transaction leaves a lock on the connection, and the truncating checkpoint
 *   at close then fails with SQLITE_LOCKED.
 * @invariants The schema and the meta rows are ready before the caller reads.
 */
export function openDatabase(
	path: string,
	language: string,
	migrations: ReadonlyArray<(db: DatabaseSync) => void> = MIGRATIONS,
): DatabaseSync {
	const db = new DatabaseSync(path);
	try {
		db.exec(
			"PRAGMA synchronous = FULL; PRAGMA secure_delete = ON; PRAGMA busy_timeout = 5000; PRAGMA temp_store = MEMORY;",
		);
		if (empty(db)) transaction(db, () => create(db, language));
		const version = schemaVersion(db, migrations);
		db.exec("PRAGMA journal_mode = WAL");
		transaction(db, () => migrate(db, migrations, version));
		debug("Store open", {
			event: "open",
			version: BASE_SCHEMA_VERSION + migrations.length,
			language,
		});
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}
// #endregion FUNC_openDatabase

/** @purpose Tell whether the database file holds no table of its own. */
function empty(db: DatabaseSync): boolean {
	const row = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1",
		)
		.get();
	return row === undefined;
}

// #region FUNC_transaction
/**
 * @purpose Run one unit of schema work in one transaction, so a failure leaves no change.
 * @invariants The caller runs no other transaction for the same work.
 */
function transaction(db: DatabaseSync, work: () => void): void {
	db.exec("BEGIN IMMEDIATE");
	try {
		work();
		db.exec("COMMIT");
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
}
// #endregion FUNC_transaction

// #region FUNC_schemaVersion
/**
 * @purpose Read and check the stored schema version, so a bad version stops the open.
 * @invariants A store without the meta table, without a version, or with an unknown version fails.
 */
function schemaVersion(
	db: DatabaseSync,
	migrations: ReadonlyArray<(db: DatabaseSync) => void>,
): number {
	const meta = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'",
		)
		.get();
	if (meta === undefined)
		throw new MemlensError("Data", "The store has no schema version.");
	const row = db
		.prepare("SELECT value FROM meta WHERE key = 'schema_version'")
		.get();
	const text = row?.value;
	if (typeof text !== "string" || !/^[1-9][0-9]*$/.test(text))
		throw new MemlensError("Data", "The store has an invalid schema version.");
	const version = Number(text);
	const current = BASE_SCHEMA_VERSION + migrations.length;
	if (
		!Number.isSafeInteger(version) ||
		version < BASE_SCHEMA_VERSION ||
		version > current
	)
		throw new MemlensError(
			"Data",
			`Unsupported store schema version: ${text}.`,
		);
	return version;
}
// #endregion FUNC_schemaVersion

// #region FUNC_migrate
/**
 * @purpose Apply each schema change in order before the store opens.
 * @invariants The caller holds a transaction for all changes and version updates.
 * @invariants The step list comes from the checked version, so a later step never runs early.
 */
function migrate(
	db: DatabaseSync,
	migrations: ReadonlyArray<(db: DatabaseSync) => void>,
	version: number,
): void {
	const update = db.prepare(
		"UPDATE meta SET value = ? WHERE key = 'schema_version'",
	);
	for (
		let index = version - BASE_SCHEMA_VERSION;
		index < migrations.length;
		index++
	) {
		debug("Migrate schema", {
			event: "migrate",
			from: BASE_SCHEMA_VERSION + index,
			to: BASE_SCHEMA_VERSION + index + 1,
		});
		const migration = migrations[index];
		if (migration === undefined)
			throw new Error(
				`Missing schema migration: ${BASE_SCHEMA_VERSION + index + 1}.`,
			);
		migration(db);
		update.run(String(BASE_SCHEMA_VERSION + index + 1));
	}
}
// #endregion FUNC_migrate

// #region FUNC_create
/**
 * @purpose Create the base schema and its meta rows for a new database.
 * @invariants The call is idempotent for the base schema.
 */
export function create(db: DatabaseSync, language: string): void {
	const tokenizer = tokenizerOf(language);
	db.exec(SCHEMA_SQL.replace("{tokenizer}", tokenizer));
	seedMeta(db, tokenizer);
	debug("Schema ready", { event: "create", tokenizer });
}
// #endregion FUNC_create

/** @purpose Seed the rows that name the schema, the store, and the index. */
function seedMeta(db: DatabaseSync, tokenizer: string): void {
	const meta = db.prepare(
		"INSERT OR IGNORE INTO meta (key, value) VALUES (?, ?)",
	);
	meta.run("schema_version", String(BASE_SCHEMA_VERSION));
	meta.run("store_id", storeId());
	const row = db
		.prepare("SELECT value FROM meta WHERE key = 'fts_tokenizer'")
		.get();
	if (row === undefined) meta.run("fts_tokenizer", tokenizer);
}
