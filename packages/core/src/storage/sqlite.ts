/**
 * #region moduleContract
 * @purpose Persist each complete domain change and its projection in one SQLite transaction.
 * @scope Local event sequence, write validation, projection snapshots, the FTS index, export, and redaction cleanup.
 * @invariants Writers use BEGIN IMMEDIATE. Events, projection, index rows, and revision commit together or roll back together.
 * @invariants Reads use the stored projection without event scans. Reopen preserves the same snapshot and revision.
 * @invariants The index lives in memlens.db. The open mounts it and rebuilds it after a language change or a loss.
 * @invariants The revision starts at zero and increases once per published plan. Duplicate writes preserve the counter.
 * @invariants Redaction clears stored content and truncates the WAL after commit. The transaction remains the source authority.
 * @invariants Close is idempotent. Every other operation rejects after close. Logs contain no event content.
 * #endregion moduleContract
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import type { ProfileScopes } from "../domain/invalidation.js";
import { project } from "../domain/projection.js";
import {
	prepareAppend,
	prepareImport,
	type WritePlan,
} from "../domain/write.js";
import { MemlensError } from "../types/errors.js";
import type { Event, JsonlLine, NodeEvent, ScopeKey } from "../types/events.js";
import type { Projection } from "../types/projection.js";
import type {
	AppendEvent,
	IndexHit,
	NodeAppendResult,
	StorePort,
	StoreRev,
} from "../types/store.js";
import type { BuildInput } from "../types/tree.js";
import { FtsIndex } from "./fts.js";
import {
	decodeProjection,
	encodeProjection,
	envelope,
	nodePlan,
	publishPlan,
} from "./publication.js";

const debug = debuglog("memlens:sqlite");

// #region CLASS_SqliteStore
/** @purpose Provide durable store operations with one SQLite writer lock per change. */
export class SqliteStore implements StorePort {
	private readonly db: DatabaseSync;
	private readonly profiles: ProfileScopes;
	private readonly index: FtsIndex;
	private closed = false;

	// #region METHOD_constructor
	/**
	 * @purpose Open memlens.db with WAL, secure deletion, a persistent empty snapshot, and a ready index.
	 * @invariants The index mounts in the open transaction. A changed language or a lost table with events
	 * rebuilds every row from the local events.
	 */
	constructor(
		directory: string,
		profiles: ProfileScopes = new Map(),
		language = "en",
	) {
		mkdirSync(directory, { recursive: true });
		this.profiles = profiles;
		this.db = new DatabaseSync(join(directory, "memlens.db"));
		this.index = new FtsIndex(language, () => this.db);
		try {
			this.db.exec(
				"PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA secure_delete = ON;",
			);
			this.transaction(() => {
				this.db.exec(`
					CREATE TABLE IF NOT EXISTS events (
						seq INTEGER PRIMARY KEY AUTOINCREMENT,
						id TEXT NOT NULL UNIQUE,
						scope TEXT NOT NULL,
						payload TEXT NOT NULL
					);
					CREATE TABLE IF NOT EXISTS state (
						id INTEGER PRIMARY KEY CHECK (id = 1),
						projection TEXT NOT NULL,
						revision TEXT NOT NULL,
						erasure INTEGER NOT NULL DEFAULT 0
					);
				`);
				this.db
					.prepare(
						"INSERT INTO state (id, projection, revision) VALUES (1, ?, ?) ON CONFLICT(id) DO NOTHING",
					)
					.run(encodeProjection(project([])), "0");
				const events = this.events();
				if (this.index.mount(this.db)) {
					this.index.replaceRows(this.db, project(events).records.values());
					debug("SQLite reindex", { event: "reindex", events: events.length });
				} else {
					const found = (
						this.db
							.prepare("SELECT EXISTS(SELECT 1 FROM hits) AS found")
							.get() as {
							found: number;
						}
					).found;
					if (found === 0 && events.length > 0) {
						this.index.replaceRows(this.db, project(events).records.values());
						debug("SQLite reindex", {
							event: "reindex",
							events: events.length,
						});
					}
				}
			}, false);
			this.cleanup();
			debug("SQLite open", { event: "reopen" });
		} catch (error) {
			this.db.close();
			throw error;
		}
	}
	// #endregion METHOD_constructor

	// #region METHOD_append
	/** @purpose Publish a validated append and every generated invalidation under the same write lock. */
	async append(event: AppendEvent): Promise<Event> {
		return this.transaction(() => {
			if (event?.op === "node")
				throw new MemlensError(
					"Data",
					"Use appendNode to validate a node input.",
				);
			const events = this.events();
			const plan = prepareAppend(
				events,
				event,
				envelope(events),
				this.profiles,
			);
			const result = plan.duplicate ?? plan.appended;
			if (!result)
				throw new MemlensError("Data", "An append plan has no result.");
			this.publish(plan);
			return result as Event;
		});
	}
	// #endregion METHOD_append

	// #region METHOD_appendNode
	/**
	 * @purpose Accept a summary only when its exact copied input still matches under the write lock.
	 * @invariants Check the result range, child ids, and input revision in the same transaction. Rejection writes nothing.
	 */
	async appendNode(
		input: BuildInput,
		node: Omit<NodeEvent, "id" | "at">,
	): Promise<NodeAppendResult> {
		return this.transaction(() => {
			const plan = nodePlan(this.events(), input, node, this.profiles);
			if ("ok" in plan) return plan;
			const result = plan.projection.nodes
				.get(node.scope)
				?.find((candidate) => candidate.id === plan.appended?.id);
			if (!result)
				throw new MemlensError("Data", "A node plan has no projected node.");
			this.publish(plan);
			return { ok: true, node: result };
		});
	}
	// #endregion METHOD_appendNode

	// #region METHOD_projection
	/** @purpose Read an independent snapshot from the projection row without an event scan. */
	async projection(): Promise<Projection> {
		this.requireOpen();
		const row = this.db
			.prepare("SELECT projection FROM state WHERE id = 1")
			.get();
		debug("SQLite read", { event: "read", kind: "projection" });
		return decodeProjection(String(row?.projection));
	}
	// #endregion METHOD_projection

	// #region METHOD_rev
	/** @purpose Read the persisted revision without an event scan. */
	async rev(): Promise<StoreRev> {
		this.requireOpen();
		const row = this.db
			.prepare("SELECT revision FROM state WHERE id = 1")
			.get();
		debug("SQLite read", { event: "read", kind: "revision" });
		return String(row?.revision);
	}
	// #endregion METHOD_rev

	// #region METHOD_search
	/** @purpose Query the index tables of the same database without an event scan. */
	async search(
		query: string,
		scope: ScopeKey | null,
		limit: number,
	): Promise<readonly IndexHit[]> {
		this.requireOpen();
		const hits = this.index.query(this.db, query, scope, limit);
		debug("SQLite read", { event: "read", kind: "search", hits: hits.length });
		return hits;
	}
	// #endregion METHOD_search

	// #region METHOD_export
	/** @purpose Copy events in local sequence from one consistent read, with an optional scope filter. */
	async export(scope: ScopeKey | null): Promise<readonly JsonlLine[]> {
		this.requireOpen();
		const rows =
			scope === null
				? this.db.prepare("SELECT payload FROM events ORDER BY seq").all()
				: this.db
						.prepare("SELECT payload FROM events WHERE scope = ? ORDER BY seq")
						.all(scope);
		debug("SQLite read", { event: "read", kind: "export", count: rows.length });
		return rows.map((row) => JSON.parse(String(row.payload)) as JsonlLine);
	}
	// #endregion METHOD_export

	// #region METHOD_import
	/** @purpose Publish the validated id union and its complete invalidation plan under the write lock. */
	async import(events: readonly JsonlLine[]): Promise<number> {
		return this.transaction(() => {
			const plan = prepareImport(this.events(), events, this.profiles);
			this.publish(plan);
			return plan.changed;
		});
	}
	// #endregion METHOD_import

	// #region METHOD_close
	/** @purpose Release the database handle once and permit repeated cleanup calls. */
	async close(): Promise<void> {
		if (this.closed) return;
		this.db.close();
		this.closed = true;
		debug("SQLite close", { event: "close" });
	}
	// #endregion METHOD_close

	private requireOpen(): void {
		if (this.closed)
			throw new MemlensError("Data", "The SQLite store is closed.");
	}

	private events(): readonly JsonlLine[] {
		return this.db
			.prepare("SELECT payload FROM events ORDER BY seq")
			.all()
			.map((row) => JSON.parse(String(row.payload)) as JsonlLine);
	}

	// #region METHOD_transaction
	/**
	 * @purpose Keep validation and publication under one writer lock and preserve committed state after cleanup errors.
	 * @invariants Failure before commit rolls back. Failure after commit never rolls back the published source.
	 */
	private transaction<T>(work: () => T, publication = true): T {
		this.requireOpen();
		this.db.exec("BEGIN IMMEDIATE");
		let result: T;
		try {
			result = work();
			if (publication)
				debug("SQLite phase", {
					event: "before_publish",
					phase: "before_publish",
				});
			this.db.exec("COMMIT");
		} catch (error) {
			try {
				this.db.exec("ROLLBACK");
				debug("SQLite rollback", { event: "rollback" });
			} catch {
				debug("SQLite rollback", { event: "rollback", failed: true });
			}
			throw error;
		}
		if (publication) {
			debug("SQLite phase", { event: "after_publish", phase: "after_publish" });
			this.cleanup();
		}
		return result;
	}
	// #endregion METHOD_transaction

	// #region METHOD_publish
	/** @purpose Persist every planned event, a complete projection, fresh index rows, and a fresh revision. */
	private publish(plan: WritePlan): void {
		if (plan.changed === 0 && plan.invalidations.length === 0) return;
		const events = publishPlan(plan);
		const update = this.db.prepare(
			"UPDATE events SET scope = ?, payload = ? WHERE id = ?",
		);
		const insert = this.db.prepare(
			"INSERT INTO events (id, scope, payload) VALUES (?, ?, ?)",
		);
		for (const event of events) {
			const payload = JSON.stringify(event);
			if (update.run(event.scope, payload, event.id).changes === 0)
				insert.run(event.id, event.scope, payload);
		}
		const cursor = Number(
			this.db
				.prepare("SELECT COALESCE(MAX(seq), 0) AS cursor FROM events")
				.get()?.cursor,
		);
		const erasure = events.some(
			(event) => event.op === "redact" || event.redacted === true,
		);
		const revision =
			BigInt(
				String(
					this.db.prepare("SELECT revision FROM state WHERE id = 1").get()
						?.revision,
				),
			) + 1n;
		this.db
			.prepare(
				"UPDATE state SET projection = ?, revision = ?, erasure = MAX(erasure, ?) WHERE id = 1",
			)
			.run(
				encodeProjection(project(events, cursor)),
				revision.toString(),
				Number(erasure),
			);
		this.index.syncRows(this.db, plan.touched, plan.projection.records);
	}
	// #endregion METHOD_publish

	// #region METHOD_cleanup
	/**
	 * @purpose Remove old content from WAL pages after a committed erasure, including an interrupted previous cleanup.
	 * @invariants A blocked checkpoint rejects the operation but never reverses its committed source transaction.
	 */
	private cleanup(): void {
		if (
			this.db.prepare("SELECT erasure FROM state WHERE id = 1").get()
				?.erasure !== 1
		)
			return;
		const checkpoint = this.db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
		if (checkpoint?.busy !== 0)
			throw new MemlensError(
				"Data",
				"The SQLite redaction checkpoint is blocked. The source transaction is committed.",
			);
	}
	// #endregion METHOD_cleanup
}
// #endregion CLASS_SqliteStore
