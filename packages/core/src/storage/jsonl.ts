/**
 * #region moduleContract
 * @purpose Preserve a portable event source across concurrent processes and interrupted publication.
 * @scope JSONL source, SQLite sidecar, an independent process lock, the FTS index, and recovery.
 * @invariants The source is memlens.jsonl. The rebuildable projection and the index live in index.db.
 * @invariants A stable SQLite lock file serializes reads, preparation, replacement, and recovery.
 * @invariants Publication replaces the complete source atomically, including every planned invalidation.
 * @invariants The index rows follow the append in one sidecar transaction with no crash guarantee.
 * @invariants A source fingerprint gates each sidecar read. Recovery processes complete lines only.
 * @invariants Recovery or a language change rewrites the sidecar file with rows from the events.
 * @invariants An erasure rewrites the sidecar file, so no cleared content stays on a stale page.
 * @invariants The cursor is the byte offset after the last complete line, independent of event time.
 * @invariants A rewrite invalidates the old cursor. A missing or corrupt sidecar changes no event or node state.
 * @invariants Reads of an unchanged source scan no event. No file contains model jobs or retry state.
 * #endregion moduleContract
 */

import { createHash } from "node:crypto";
import {
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { debuglog } from "node:util";
import {
	type ProfileScopes,
	planInvalidation,
} from "../domain/invalidation.js";
import { project } from "../domain/projection.js";
import { redactionClosure } from "../domain/sanitization.js";
import { validateEvent, validateTargets } from "../domain/validation.js";
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

const debug = debuglog("memlens:jsonl");
type Snapshot = {
	fingerprint: string;
	revision: string;
	projection: Projection;
};

// #region CLASS_JsonlStore
/** @purpose Give each process consistent durable reads and writes over a portable JSONL source. */
export class JsonlStore implements StorePort {
	private readonly lock: DatabaseSync;
	private readonly source: string;
	private readonly sidecar: string;
	private readonly temporary: string;
	private readonly index: FtsIndex;
	private closed = false;

	/** @purpose Open a directory without trusting an earlier process cache. */
	constructor(
		private readonly directory: string,
		private readonly profiles: ProfileScopes = new Map(),
		language = "en",
	) {
		mkdirSync(directory, { recursive: true });
		this.source = join(directory, "memlens.jsonl");
		this.sidecar = join(directory, "index.db");
		this.temporary = join(directory, "memlens.jsonl.tmp");
		this.lock = new DatabaseSync(join(directory, ".memlens-lock.db"));
		this.index = new FtsIndex(
			language,
			() => new DatabaseSync(this.sidecar),
			(db) => db.close(),
		);
		try {
			this.lock.exec("PRAGMA busy_timeout = 30000");
			this.locked(() => {
				if (!existsSync(this.source)) this.replace([]);
				this.snapshot();
			});
			debug("Store opened", { event: "open" });
		} catch (error) {
			this.lock.close();
			throw error;
		}
	}

	// #region METHOD_append
	/** @purpose Publish a validated local operation and its invalidations under one lock. */
	async append(event: AppendEvent): Promise<Event> {
		return this.locked(() => {
			if (event.op === "node")
				throw new MemlensError("Data", "Use appendNode to publish a node.");
			this.snapshot();
			const local = this.history();
			const plan = prepareAppend(local, event, envelope(local), this.profiles);
			this.publish(plan);
			return (plan.duplicate ?? plan.appended) as Event;
		});
	}
	// #endregion METHOD_append

	// #region METHOD_appendNode
	/** @purpose Check the exact copied children and publish a result under the same lock. */
	async appendNode(
		input: BuildInput,
		node: Omit<NodeEvent, "id" | "at">,
	): Promise<NodeAppendResult> {
		return this.locked(() => {
			this.snapshot();
			const plan = nodePlan(this.history(), input, node, this.profiles);
			if ("ok" in plan) return plan;
			const result = plan.projection.nodes
				.get(node.scope)
				?.find((item) => item.id === plan.appended?.id);
			if (!result)
				throw new MemlensError("Data", "A node plan has no projected node.");
			this.publish(plan);
			return { ok: true, node: result };
		});
	}
	// #endregion METHOD_appendNode

	// #region METHOD_projection
	/** @purpose Return a detached snapshot after source recovery without an unchanged log scan. */
	async projection(): Promise<Projection> {
		return this.locked(() => this.snapshot().projection);
	}
	// #endregion METHOD_projection

	// #region METHOD_rev
	/** @purpose Fingerprint the complete source so content replacement changes the revision. */
	async rev(): Promise<StoreRev> {
		return this.locked(() => this.snapshot().revision);
	}
	// #endregion METHOD_rev

	// #region METHOD_search
	/**
	 * @purpose Query the index tables of a fresh sidecar under the process lock.
	 * @invariants A snapshot recovery runs first, so a gap from an interrupted append never hides a hit.
	 */
	async search(
		query: string,
		scope: ScopeKey | null,
		limit: number,
	): Promise<readonly IndexHit[]> {
		return this.locked(() => {
			this.snapshot();
			const db = new DatabaseSync(this.sidecar);
			try {
				return this.index.query(db, query, scope, limit);
			} finally {
				db.close();
			}
		});
	}
	// #endregion METHOD_search

	// #region METHOD_export
	/** @purpose Copy a consistent history, including nodes and invalidations in the selected scope. */
	async export(scope: ScopeKey | null): Promise<readonly JsonlLine[]> {
		return this.locked(() => {
			this.snapshot();
			return this.history().filter(
				(event) => scope === null || event.scope === scope,
			);
		});
	}
	// #endregion METHOD_export

	// #region METHOD_import
	/** @purpose Publish the domain union without restoring cleared content or stale summaries. */
	async import(events: readonly JsonlLine[]): Promise<number> {
		return this.locked(() => {
			this.snapshot();
			const plan = prepareImport(this.history(), events, this.profiles);
			this.publish(plan);
			return plan.changed;
		});
	}
	// #endregion METHOD_import

	// #region METHOD_repair
	/**
	 * @purpose Remove an incomplete source tail and rebuild the sidecar from the complete log.
	 * @invariants The complete lines are the authority. A partial final line leaves the source.
	 * The sidecar file is rewritten with fresh index rows. A dry run lists the changes and writes
	 * nothing.
	 */
	async repair(dryRun: boolean): Promise<readonly string[]> {
		return this.locked(() => {
			const changes: string[] = [];
			const bytes = readFileSync(this.source);
			const cursor = bytes.lastIndexOf(10) + 1;
			const tail = bytes.length - cursor;
			if (tail > 0) changes.push(`truncate ${tail} incomplete tail bytes`);
			const events = this.history();
			changes.push(`rebuild ${project(events).records.size} index rows`);
			debug("JSONL repair planned", {
				event: "repair",
				dryRun,
				tail,
				changes: changes.length,
			});
			if (dryRun) return changes;
			if (tail > 0) {
				this.replace(events);
				this.snapshot();
			} else {
				this.save(this.snapshot(), events);
			}
			return changes;
		});
	}
	// #endregion METHOD_repair

	// #region METHOD_close
	/** @purpose Release the process handle after synchronous durable writes. Repeated close has no effect. */
	async close(): Promise<void> {
		if (this.closed) return;
		this.lock.close();
		this.closed = true;
		debug("Store closed", { event: "close" });
	}
	// #endregion METHOD_close

	private locked<T>(operation: () => T): T {
		if (this.closed) throw new MemlensError("Data", "The store is closed.");
		this.lock.exec("BEGIN IMMEDIATE");
		try {
			const result = operation();
			this.lock.exec("COMMIT");
			return result;
		} catch (error) {
			this.lock.exec("ROLLBACK");
			debug("Store operation failed", { event: "failure" });
			throw error;
		}
	}

	private fingerprint(): string {
		const stat = statSync(this.source, { bigint: true });
		return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
	}

	private history(bytes = readFileSync(this.source)): JsonlLine[] {
		const end = bytes.lastIndexOf(10) + 1;
		const events = bytes
			.subarray(0, end)
			.toString("utf8")
			.split("\n")
			.filter(Boolean)
			.map((line) => validateEvent(JSON.parse(line)));
		validateTargets(events, true);
		if (new Set(events.map((event) => event.id)).size !== events.length)
			throw new MemlensError(
				"Data",
				"The source contains duplicate event ids.",
			);
		return events;
	}

	// #region METHOD_snapshot
	/**
	 * @purpose Recover a missing projection before any read can expose stale content.
	 * @invariants The sidecar commits the fingerprint, projection, index rows, and byte cursor together.
	 * @invariants A partial final line contributes no event. A malformed complete line fails the read.
	 * @invariants A stale, missing, or old sidecar index forces a full rebuild from the events.
	 */
	private snapshot(): Snapshot {
		if (existsSync(this.temporary)) unlinkSync(this.temporary);
		const fingerprint = this.fingerprint();
		let db: DatabaseSync | undefined;
		let previous: Snapshot | undefined;
		try {
			db = new DatabaseSync(this.sidecar);
			db.exec(
				"PRAGMA secure_delete = ON; CREATE TABLE IF NOT EXISTS snapshot (fingerprint TEXT, revision TEXT, projection TEXT)",
			);
			const row = db.prepare("SELECT * FROM snapshot").get() as
				| { fingerprint: string; revision: string; projection: string }
				| undefined;
			if (row && row.fingerprint === fingerprint && this.index.ready(db)) {
				previous = { ...row, projection: decodeProjection(row.projection) };
				debug("Projection read", {
					event: "read",
					cursor: previous.projection.cursor,
				});
				return previous;
			}
			if (row)
				previous = { ...row, projection: decodeProjection(row.projection) };
		} catch {
			debug("Sidecar rejected", { event: "sidecar_rebuild" });
		} finally {
			db?.close();
		}
		const bytes = readFileSync(this.source);
		const cursor = bytes.lastIndexOf(10) + 1;
		const events = this.history(bytes);
		const oldCursor = previous?.projection.cursor ?? 0;
		const prefix = bytes.subarray(0, oldCursor);
		const tail =
			previous &&
			oldCursor <= cursor &&
			createHash("sha256").update(prefix).digest("hex") === previous.revision;
		const before = tail ? this.history(prefix) : events;
		const sanitized = redactionClosure(events);
		const invalidations = tail
			? planInvalidation(before, sanitized, this.profiles).invalidations
			: this.recoverInvalidations(sanitized);
		if (
			invalidations.length ||
			JSON.stringify(sanitized) !== JSON.stringify(events)
		) {
			const recovered = [...sanitized];
			for (const invalidation of invalidations)
				recovered.push({
					...envelope(recovered),
					op: "invalidate",
					...invalidation,
				});
			this.replace(recovered);
			return this.snapshot();
		}
		const projection = project(events, cursor);
		const revision = createHash("sha256").update(bytes).digest("hex");
		const snapshot = { fingerprint, revision, projection };
		this.save(snapshot, events);
		debug("Projection recovered", {
			event: "recovery",
			cursor,
			previous: oldCursor,
			tail: Boolean(tail),
		});
		return snapshot;
	}
	// #endregion METHOD_snapshot

	// #region METHOD_recoverInvalidations
	/**
	 * @purpose Recover missing invalidations from local file order when no trusted cursor survives.
	 * @invariants Event times do not define append order. Compare each later change against its preceding prefix.
	 * @invariants Existing invalidations prevent additional events. Unchanged built branches remain usable.
	 */
	private recoverInvalidations(
		events: readonly JsonlLine[],
	): readonly { scope: ScopeKey; targets: readonly string[] }[] {
		const targets = new Map<ScopeKey, Set<string>>();
		const retained = new Set(
			events.flatMap((event) =>
				event.op === "invalidate" ? event.targets : [],
			),
		);
		let hasNode = false;
		for (let index = 0; index < events.length; index++) {
			const event = events[index];
			if (!event) continue;
			if (hasNode && event.op !== "invalidate") {
				const plan = planInvalidation(
					events.slice(0, index),
					events.slice(0, index + 1),
					this.profiles,
				);
				for (const invalidation of plan.invalidations) {
					let ids = targets.get(invalidation.scope);
					if (!ids) {
						ids = new Set();
						targets.set(invalidation.scope, ids);
					}
					for (const id of invalidation.targets)
						if (!retained.has(id)) ids.add(id);
				}
			}
			if (event.op === "node") hasNode = true;
		}
		return [...targets]
			.filter(([, ids]) => ids.size)
			.map(([scope, ids]) => ({ scope, targets: [...ids].sort() }));
	}
	// #endregion METHOD_recoverInvalidations

	// #region METHOD_save
	/**
	 * @purpose Write one fresh sidecar file with the projection and a complete index rebuild.
	 * @invariants A fresh file keeps no stale page, so an erasure or a language change leaves no old content.
	 */
	private save(snapshot: Snapshot, events: readonly JsonlLine[]): void {
		// The stable lock permits replacement of a corrupt or private cache.
		if (existsSync(this.sidecar)) unlinkSync(this.sidecar);
		const db = new DatabaseSync(this.sidecar);
		try {
			db.exec(
				"PRAGMA journal_mode = DELETE; PRAGMA secure_delete = ON; BEGIN IMMEDIATE; CREATE TABLE snapshot (fingerprint TEXT, revision TEXT, projection TEXT)",
			);
			db.prepare("INSERT INTO snapshot VALUES (?, ?, ?)").run(
				snapshot.fingerprint,
				snapshot.revision,
				encodeProjection(snapshot.projection),
			);
			this.index.mount(db);
			this.index.replaceRows(db, project(events).records.values());
			db.exec("COMMIT");
		} finally {
			db.close();
		}
	}
	// #endregion METHOD_save

	// #region METHOD_update
	/**
	 * @purpose Apply one published plan to the sidecar in one transaction after the source replacement.
	 * @invariants The index rows and the snapshot row commit together, so no read sees a mixed sidecar.
	 * @invariants A changed language, a missing table, or a corrupt file falls back to a fresh rebuild.
	 */
	private update(
		snapshot: Snapshot,
		plan: WritePlan,
		events: readonly JsonlLine[],
	): void {
		let db: DatabaseSync | undefined;
		try {
			db = new DatabaseSync(this.sidecar);
			db.exec(
				"PRAGMA busy_timeout = 5000; PRAGMA secure_delete = ON; BEGIN IMMEDIATE",
			);
			if (this.index.mount(db)) {
				db.exec("ROLLBACK");
				db.close();
				this.save(snapshot, events);
				return;
			}
			this.index.syncRows(db, plan.touched, plan.projection.records);
			db.exec("DELETE FROM snapshot");
			db.prepare("INSERT INTO snapshot VALUES (?, ?, ?)").run(
				snapshot.fingerprint,
				snapshot.revision,
				encodeProjection(snapshot.projection),
			);
			db.exec("COMMIT");
		} catch {
			debug("Sidecar update rejected", { event: "sidecar_rebuild" });
			try {
				db?.exec("ROLLBACK");
			} catch {
				// A failed open or rollback keeps no transaction to undo.
			}
			db?.close();
			this.save(snapshot, events);
			return;
		}
		db.close();
	}
	// #endregion METHOD_update

	// #region METHOD_replace
	/**
	 * @purpose Publish every event and invalidation with one durable file replacement.
	 * @invariants A failure before rename retains the old source. A failure after rename retains the complete new source.
	 * @invariants An erasure discards the old sidecar before the rename, so no cleared content file survives a crash.
	 */
	private replace(events: readonly JsonlLine[]): void {
		const data =
			events.map((event) => JSON.stringify(event)).join("\n") +
			(events.length ? "\n" : "");
		const fd = openSync(this.temporary, "w", 0o600);
		try {
			writeFileSync(fd, data);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		if (
			existsSync(this.sidecar) &&
			events.some((event) => event.op === "redact" || event.redacted === true)
		)
			unlinkSync(this.sidecar);
		debug("Publication ready", {
			event: "before_publish",
			events: events.length,
		});
		renameSync(this.temporary, this.source);
		const directory = openSync(this.directory, "r");
		try {
			fsyncSync(directory);
		} finally {
			closeSync(directory);
		}
		debug("Publication complete", {
			event: "after_publish",
			events: events.length,
		});
	}
	// #endregion METHOD_replace

	private publish(plan: WritePlan): Projection | null {
		if (plan.changed === 0 && plan.invalidations.length === 0) return null;
		const events = publishPlan(plan);
		this.replace(events);
		const bytes = readFileSync(this.source);
		const projection = project(events, bytes.length);
		const snapshot = {
			fingerprint: this.fingerprint(),
			revision: createHash("sha256").update(bytes).digest("hex"),
			projection,
		};
		if (
			events.some((event) => event.op === "redact" || event.redacted === true)
		)
			this.save(snapshot, events);
		else this.update(snapshot, plan, events);
		return projection;
	}
}
// #endregion CLASS_JsonlStore
