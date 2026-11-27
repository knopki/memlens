/**
 * #region moduleContract
 * @modulecontract
 * @purpose Create and open the one database that holds the memory.
 * @scope Pragmas, the schema, the schema version, the meta rows, and the bounded lock wait of one transaction.
 *  NOT: reads and writes.
 * @invariants Every connection sets secure_delete, busy_timeout, and temp_store.
 * @invariants The index carries the FTS5 secure-delete option, so a delete removes its tokens.
 * @invariants The meta rows hold schema_version, store_id, clock, and fts_tokenizer.
 * @invariants Schema changes and their version updates commit in one transaction.
 * @invariants The pragma busy_timeout waits for a lock inside the engine, and the wait stays within one
 *   second, so a caller resumes fast.
 * @invariants A lock that the engine reports at once repeats within the same one-second deadline.
 * @invariants A retry repeats the lock acquisition only. The work of a transaction runs once.
 * @invariants The open builds the index with the tokenizer of the language key when the stored
 *   tokenizer differs, so a language change needs no command.
 * @keywords schema, open, pragma, database, migration, version
 * #endregion moduleContract
 */

import { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";
import { storeId } from "./clock.js";

const debug = debuglog("memlens:schema");

/** The longest wait of one lock inside the engine, and of a lock that the engine reports at once. */
const BUSY_TIMEOUT_MS = 1000;

/** The pause after one attempt of a lock that the engine reports at once. */
const LOCK_PAUSE_MS = 25;

const BASE_SCHEMA_VERSION = 2;

/** Keep the base schema fixed. Add each later schema change to this list in order. */
const MIGRATIONS: ReadonlyArray<(db: DatabaseSync) => void> = [
	widenKindCheck,
	indexOpenProposalExpiry,
];

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

// #region FUNC_indexOpenProposalExpiry
/**
 * @purpose Index the expiry of each open proposal, so one sweep check reads one row without a scan.
 * @invariants The index covers the open rows only, so a closed row adds no index entry.
 */
function indexOpenProposalExpiry(db: DatabaseSync): void {
	db.exec(`
		CREATE INDEX IF NOT EXISTS proposals_expiry
			ON proposals (expires_at) WHERE closed = 0;
	`);
}
// #endregion FUNC_indexOpenProposalExpiry

/** The tokenizer of each language that the default does not serve. Only zh and ja use trigram. */
const TOKENIZERS: Record<string, string> = {
	zh: "trigram",
	ja: "trigram",
};

/** The search index text. The tokenizer placeholder is replaced at each build. */
const FTS_SQL = `
		CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(
			body, longform,
			content = 'notes', content_rowid = 'n',
			tokenize = '{tokenizer}'
		);
		INSERT INTO fts(fts, rank) VALUES ('secure-delete', 1);
	`;

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
		CREATE INDEX IF NOT EXISTS proposals_expiry ON proposals (expires_at)
			WHERE closed = 0;
		CREATE TABLE IF NOT EXISTS journal (
			seq    INTEGER PRIMARY KEY AUTOINCREMENT,
			at     TEXT NOT NULL,
			store  TEXT NOT NULL,
			op     TEXT NOT NULL,
			target TEXT,
			scope  TEXT,
			reason TEXT CHECK (reason IS NULL OR length(reason) <= 200)
		);
		${FTS_SQL}
	`;

function tokenizerOf(language: string): string {
	return TOKENIZERS[language] ?? "porter unicode61 remove_diacritics 1";
}

function indexTokenizer(db: DatabaseSync): string | null {
	const row = db
		.prepare("SELECT value FROM meta WHERE key = 'fts_tokenizer'")
		.get();
	return typeof row?.value === "string" ? row.value : null;
}

// #region FUNC_rebuildIndex
/**
 * @purpose Build the search index with the tokenizer of the language key.
 * @invariants The caller compares the stored tokenizer before it opens a write transaction, so an
 *   open of a current store takes no write lock.
 * @invariants The rebuild reads the note rows of the store and calls no model.
 */
function rebuildIndex(db: DatabaseSync, language: string): void {
	const tokenizer = tokenizerOf(language);
	const stored = indexTokenizer(db);
	db.exec("DROP TABLE IF EXISTS fts");
	db.exec(FTS_SQL.replace("{tokenizer}", tokenizer));
	db.exec("INSERT INTO fts(fts) VALUES ('rebuild')");
	db.prepare("UPDATE meta SET value = ? WHERE key = 'fts_tokenizer'").run(
		tokenizer,
	);
	debug("Index rebuild", { event: "index", from: stored, to: tokenizer });
}
// #endregion FUNC_rebuildIndex

// #region FUNC_openDatabase
/**
 * @purpose Open one database file with the required settings and the schema.
 * @invariants The open rejects an unknown schema version before it changes the file.
 * @invariants The open sets the journal mode before migrations. A step that renames a table in
 *   a rollback-journal transaction leaves a lock on the connection, and the truncating checkpoint
 *   at close then fails with SQLITE_LOCKED.
 * @invariants The schema work waits for a lock of another process. Each check runs again after the
 *   wait, because the other process may have created or migrated the store meanwhile.
 * @invariants The schema and the meta rows are ready before the caller reads.
 * @invariants The index holds the tokenizer of the language key after the open.
 */
export function openDatabase(
	path: string,
	language: string,
	migrations: ReadonlyArray<(db: DatabaseSync) => void> = MIGRATIONS,
): DatabaseSync {
	const db = new DatabaseSync(path);
	try {
		db.exec(
			`PRAGMA synchronous = FULL; PRAGMA secure_delete = ON; PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}; PRAGMA temp_store = MEMORY;`,
		);
		if (empty(db))
			transaction(db, () => {
				if (empty(db)) create(db, language);
			});
		const version = schemaVersion(db, migrations);
		if (db.prepare("PRAGMA journal_mode").get()?.journal_mode !== "wal")
			writeAheadLog(db);
		if (version < BASE_SCHEMA_VERSION + migrations.length)
			transaction(db, () =>
				migrate(db, migrations, schemaVersion(db, migrations)),
			);
		if (indexTokenizer(db) !== tokenizerOf(language))
			transaction(db, () => rebuildIndex(db, language));
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

function empty(db: DatabaseSync): boolean {
	const row = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1",
		)
		.get();
	return row === undefined;
}

// #region FUNC_isLockError
/**
 * @purpose Name the two transient lock results of the engine, so only those wait for a later attempt.
 * @invariants The check reads the numeric result of the engine. SQLITE_BUSY is 5, and SQLITE_LOCKED is 6.
 */
function isLockError(error: unknown): boolean {
	if (typeof error !== "object" || error === null) return false;
	const code = (error as { errcode?: unknown }).errcode;
	if (typeof code !== "number") return false;
	const primary = code & 0xff;
	return primary === 5 || primary === 6;
}
// #endregion FUNC_isLockError

function pause(ms: number): void {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// #region FUNC_beginTransaction
/**
 * @purpose Start one transaction, and name a lock of another process as one store error.
 * @invariants The pragma busy_timeout waits inside the engine. One attempt then keeps the wait short.
 * @invariants A failed BEGIN starts no transaction, so the caller repeats no work.
 * @invariants The wait blocks the thread. Only another process can release the lock during it.
 * @throws MemlensError when the attempt meets a lock.
 */
export function beginTransaction(
	db: DatabaseSync,
	mode: "DEFERRED" | "IMMEDIATE",
): void {
	try {
		db.exec(`BEGIN ${mode}`);
	} catch (error) {
		if (!isLockError(error)) throw error;
		debug("Transaction locked", { event: "locked", mode });
		throw new MemlensError("Data", "The store is locked. Retry the operation.");
	}
}
// #endregion FUNC_beginTransaction

// #region FUNC_transaction
/**
 * @purpose Run one unit of schema work in one transaction, so a failure leaves no change.
 * @invariants The caller runs no other transaction for the same work.
 * @invariants Only the lock acquisition repeats. The work and the commit run once.
 */
function transaction(db: DatabaseSync, work: () => void): void {
	beginTransaction(db, "IMMEDIATE");
	try {
		work();
		db.exec("COMMIT");
	} catch (error) {
		try {
			db.exec("ROLLBACK");
		} catch {
			// A commit that failed can close the transaction before this rollback.
		}
		throw error;
	}
}
// #endregion FUNC_transaction

// #region FUNC_writeAheadLog
/**
 * @purpose Set the write-ahead log, and wait through a transient lock of another process.
 * @invariants The pragma reports a lock result at once, so this loop holds its own short deadline.
 * @invariants Each attempt waits a short pause. The call reports one error when the deadline passes.
 * @invariants The pragma reports the mode that it keeps. A mode other than wal stops the open.
 */
function writeAheadLog(db: DatabaseSync): void {
	const deadline = Date.now() + BUSY_TIMEOUT_MS;
	for (;;) {
		let row: Record<string, unknown> | undefined;
		try {
			row = db.prepare("PRAGMA journal_mode = WAL").get() as
				| Record<string, unknown>
				| undefined;
		} catch (error) {
			if (!isLockError(error)) throw error;
			if (Date.now() >= deadline)
				throw new MemlensError(
					"Data",
					"The store is locked. Retry the operation.",
				);
			debug("Log mode locked", { event: "log_locked" });
			pause(LOCK_PAUSE_MS);
			continue;
		}
		const mode = String(row?.journal_mode ?? "");
		if (mode === "wal") return;
		throw new MemlensError(
			"Data",
			`The store cannot use the write-ahead log: ${mode}.`,
		);
	}
}
// #endregion FUNC_writeAheadLog

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

// #region FUNC_seedMeta
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
// #endregion FUNC_seedMeta
