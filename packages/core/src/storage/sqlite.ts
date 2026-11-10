/**
 * #region moduleContract
 * @modulecontract
 * @purpose Reserve the SQLite backend entry point without an incomplete persistence implementation.
 * @scope A store port stub. Transactions, WAL, and index access remain unimplemented.
 * #endregion moduleContract
 */

import { StorageStub } from "./stub.js";

// #region CLASS_SqliteStore
/** @purpose Let callers bind the SQLite port before its persistent backend exists. */
export class SqliteStore extends StorageStub {
	constructor() {
		super("sqlite");
	}
}
// #endregion CLASS_SqliteStore
