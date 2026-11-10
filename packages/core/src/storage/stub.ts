/**
 * #region moduleContract
 * @modulecontract
 * @purpose Expose unfinished storage operations without a false persistence guarantee.
 * @scope Shared behavior for the SQLite and JSONL stubs. No file access.
 * @invariants Data operations reject explicitly. Close has no side effect.
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { MemlensError } from "../types/errors.js";
import type { Event, JsonlLine, NodeEvent, ScopeKey } from "../types/events.js";
import type { Projection } from "../types/projection.js";
import type {
	AppendEvent,
	NodeAppendResult,
	StorePort,
	StoreRev,
} from "../types/store.js";
import type { BuildInput } from "../types/tree.js";

const debug = debuglog("memlens:storage");

// #region CLASS_StorageStub
/** @purpose Keep both backend placeholders consistent with the store port. */
export class StorageStub implements StorePort {
	constructor(readonly backend: "sqlite" | "jsonl") {
		debug("Storage stub created", { event: "stub_created", backend });
	}

	private unavailable(): MemlensError {
		debug("Storage unavailable", {
			event: "not_implemented",
			backend: this.backend,
		});
		return new MemlensError(
			"Data",
			`The ${this.backend} storage backend is not implemented.`,
		);
	}

	// #region METHOD_append
	/** @purpose Reject a write until the backend can guarantee atomic persistence. */
	async append(_event: AppendEvent): Promise<Event> {
		throw this.unavailable();
	}
	// #endregion METHOD_append

	// #region METHOD_appendNode
	/** @purpose Reject a summary until the backend can check inputs under its write lock. */
	async appendNode(
		_input: BuildInput,
		_node: Omit<NodeEvent, "id" | "at">,
	): Promise<NodeAppendResult> {
		throw this.unavailable();
	}
	// #endregion METHOD_appendNode

	// #region METHOD_projection
	/** @purpose Reject a read until the backend maintains its projection. */
	async projection(): Promise<Projection> {
		throw this.unavailable();
	}
	// #endregion METHOD_projection

	// #region METHOD_rev
	/** @purpose Reject a revision request until the backend tracks source changes. */
	async rev(): Promise<StoreRev> {
		throw this.unavailable();
	}
	// #endregion METHOD_rev

	// #region METHOD_export
	/** @purpose Reject an export until the backend can copy a consistent source. */
	async export(_scope: ScopeKey | null): Promise<readonly JsonlLine[]> {
		throw this.unavailable();
	}
	// #endregion METHOD_export

	// #region METHOD_import
	/** @purpose Reject an import until the backend can publish the complete event union. */
	async import(_events: readonly JsonlLine[]): Promise<number> {
		throw this.unavailable();
	}
	// #endregion METHOD_import

	// #region METHOD_close
	/** @purpose Permit cleanup when a stub has no open handle. */
	async close(): Promise<void> {
		debug("Storage stub closed", { event: "close", backend: this.backend });
	}
	// #endregion METHOD_close
}
// #endregion CLASS_StorageStub
