/**
 * #region moduleContract
 * @modulecontract
 * @purpose Reserve the JSONL backend entry point without an incomplete persistence implementation.
 * @scope A store port stub. File locks, replay cursors, and sidecars remain unimplemented.
 * #endregion moduleContract
 */

import { StorageStub } from "./stub.js";

// #region CLASS_JsonlStore
/** @purpose Let callers bind the JSONL port before its persistent backend exists. */
export class JsonlStore extends StorageStub {
	constructor() {
		super("jsonl");
	}
}
// #endregion CLASS_JsonlStore
