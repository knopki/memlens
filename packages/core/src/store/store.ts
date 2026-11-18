/**
 * #region moduleContract
 * @modulecontract
 * @purpose Keep one database open and publish each change as one transaction.
 * @scope The transaction gate, the clock tick, the meta access, the journal writer, and the checkpoints.
 * @invariants One function opens a write transaction, so the store has one lock owner.
 * @invariants Only the lock acquisition waits and repeats. The work of a transaction runs once.
 * @invariants A commit that reports no success reports no value.
 * @invariants The wait of a lock blocks the event loop, so only another process can release the lock.
 * @invariants The truncating checkpoint is best effort. A busy or failed result is a state, not an error.
 * @dependencies USES API: node:sqlite
 * @keywords store, transaction, publish, clock, journal, checkpoint, close
 * #endregion moduleContract
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";
import { type ClockState, parseVersion, tick, type Version } from "./clock.js";
import { beginTransaction, openDatabase } from "./schema.js";

const debug = debuglog("memlens:store");

// #region CLASS_Store
/**
 * @purpose Hold one database handle and own every write transaction of the store.
 * @invariants Reads use the same handle with one statement or a short deferred transaction.
 * @invariants Close is idempotent, and every other call rejects after close.
 * @invariants A lock wait repeats the lock acquisition only, never the change of the caller.
 */
export class Store {
	private readonly db: DatabaseSync;
	private closed = false;

	constructor(directory: string, language = "en") {
		mkdirSync(directory, { recursive: true });
		this.db = openDatabase(join(directory, "memlens.db"), language);
	}

	// #region METHOD_publish
	/**
	 * @purpose Run one change under the write lock and tick the clock when the change writes.
	 * @invariants A failed change rolls back and leaves the clock at its earlier value.
	 * @invariants A change that writes no row writes no clock value, so a rejected build moves no epoch.
	 * @invariants A lock result waits before the work starts, so the work of one attempt runs once.
	 * @invariants The call reports its value after the commit only.
	 * @returns The value of the work, and the version of the change.
	 */
	publish<T>(work: (tx: Tx) => T): { value: T; version: Version } {
		this.requireOpen();
		beginTransaction(this.db, "IMMEDIATE");
		try {
			const clock = this.clock();
			const next = tick(clock);
			const tx = new Tx(this.db, clock.store, next.version);
			const before = totalChanges(this.db);
			const value = work(tx);
			const changed = totalChanges(this.db) > before;
			if (changed) {
				// The work may fold imported versions into the clock. Keep the greater value.
				const folded = this.meta("clock");
				const final =
					folded !== null && folded > next.version ? folded : next.version;
				this.setMeta("clock", final);
				this.commit();
				debug("Publish", { event: "publish", version: final });
			} else {
				this.commit();
				debug("Publish no-op", { event: "publish", noop: true });
			}
			return { value, version: next.version };
		} catch (error) {
			this.abandon();
			throw error;
		}
	}
	// #endregion METHOD_publish

	// #region METHOD_commit
	/**
	 * @purpose Commit the open transaction, and never report a value for a commit that did not take.
	 * @invariants The commit does not repeat, because the work of the transaction already ran.
	 * @invariants A commit that leaves no open transaction has an unknown result, so the call throws.
	 */
	private commit(): void {
		try {
			this.db.exec("COMMIT");
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			if (this.abandon()) {
				debug("Commit failed", { event: "commit", failed: true });
				throw new MemlensError("Data", `The change did not commit: ${reason}`);
			}
			debug("Commit unknown", { event: "commit", unknown: true });
			throw new MemlensError(
				"Data",
				"The result of the commit is unknown. Check the store before a retry.",
			);
		}
	}
	// #endregion METHOD_commit

	// #region METHOD_abandon
	/**
	 * @purpose Drop the open transaction, if the connection still holds one.
	 * @invariants The call reports whether a transaction was open, and throws nothing.
	 */
	private abandon(): boolean {
		try {
			this.db.exec("ROLLBACK");
			debug("Rollback", { event: "rollback" });
			return true;
		} catch {
			debug("No transaction to roll back", { event: "rollback", open: false });
			return false;
		}
	}
	// #endregion METHOD_abandon

	/** @purpose Read one value from the meta table. */
	meta(key: string): string | null {
		this.requireOpen();
		const row = this.db
			.prepare("SELECT value FROM meta WHERE key = ?")
			.get(key);
		return row === undefined ? null : String(row.value);
	}

	/** @purpose Read the change epoch: the clock text of the store. */
	rev(): string {
		return this.meta("clock") ?? "";
	}

	private storeId(): string {
		return this.meta("store_id") ?? "";
	}

	// #region METHOD_truncate
	/**
	 * @purpose Move each committed frame into the database file and empty the write-ahead log.
	 * @invariants The call runs outside a transaction. A busy result is a state, not an error.
	 * @invariants A failed checkpoint is a state too, because the caller has committed its change.
	 * @returns True when the log is empty, and false when the log stays full.
	 */
	truncate(): boolean {
		this.requireOpen();
		try {
			const result = this.db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
			const busy = Number(result?.busy ?? 0) !== 0;
			debug("Checkpoint", { event: "checkpoint", busy });
			return !busy;
		} catch (error) {
			debug("Checkpoint failed", {
				event: "checkpoint",
				failed: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}
	// #endregion METHOD_truncate

	// #region METHOD_read
	/**
	 * @purpose Run one read in a deferred transaction, so each statement sees one state.
	 * @invariants A lock result waits before the read starts, so each statement sees one state.
	 * @invariants The call reports its value after the commit only.
	 */
	read<T>(work: (db: DatabaseSync) => T): T {
		this.requireOpen();
		beginTransaction(this.db, "DEFERRED");
		try {
			const value = work(this.db);
			this.commit();
			return value;
		} catch (error) {
			this.abandon();
			throw error;
		}
	}
	// #endregion METHOD_read

	/** @purpose Give the caller the open handle for a read model. */
	handle(): DatabaseSync {
		this.requireOpen();
		return this.db;
	}

	// #region METHOD_close
	/** @purpose Release the handle once. */
	close(): void {
		if (this.closed) return;
		this.db.close();
		this.closed = true;
		debug("Store close", { event: "close" });
	}
	// #endregion METHOD_close

	/** @purpose Read the clock, or create it on the first call of a new store. */
	private clock(): ClockState {
		const text = this.meta("clock");
		const parsed = text === null ? null : parseVersion(text);
		return (
			parsed ?? {
				physical: 0,
				counter: 0,
				store: this.storeId(),
			}
		);
	}

	private setMeta(key: string, value: string): void {
		this.db
			.prepare(
				"INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
			)
			.run(key, value);
	}

	private requireOpen(): void {
		if (this.closed) throw new MemlensError("Data", "The store is closed.");
	}
}
// #endregion CLASS_Store

// #region CLASS_Tx
/**
 * @purpose Give one publish call its transaction, its store identity, and its journal writer.
 * @invariants The transaction owns every statement of the change. The caller writes no BEGIN.
 */
export class Tx {
	constructor(
		readonly db: DatabaseSync,
		readonly store: string,
		readonly version: Version,
	) {}

	/** @purpose Append one content-free audit fact of this change. */
	journal(
		op: string,
		target: string | null,
		scope: string | null,
		reason?: string,
	): void {
		this.db
			.prepare(
				"INSERT INTO journal (at, store, op, target, scope, reason) VALUES (?, ?, ?, ?, ?, ?)",
			)
			.run(
				new Date().toISOString(),
				this.store,
				op,
				target,
				scope,
				reason ?? null,
			);
	}
}
// #endregion CLASS_Tx

/** @purpose Read the cumulative write count of the connection, so one publish sees its own writes. */
function totalChanges(db: DatabaseSync): number {
	return Number(db.prepare("SELECT total_changes() AS c").get()?.c ?? 0);
}
