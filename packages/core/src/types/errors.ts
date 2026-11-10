/**
 * Error codes and error types.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Define every named error of the library, so the CLI and the plugin map codes to exit codes.
 * @scope
 *  - The error codes and the MemlensError class.
 *  - NOT: error handling of the store backends, OS errors, or model errors.
 * @invariants
 *  - An error carries code and message.
 *  - The code is one of the named values in ErrorCode.
 * @keywords errors, ErrorCode, NotAllowed, CrossScopeSupersede, Usage, Data
 * #endregion moduleContract
 */

import { debuglog } from "node:util";

const debug = debuglog("memlens:errors");

/**
 * The named error codes of the library.
 *
 * The CLI maps each code to an exit code:
 *   NotAllowed  -> 3
 *   CrossScopeSupersede -> 1
 *   Usage -> 2
 *   Data -> 1
 */
export type ErrorCode = "NotAllowed" | "CrossScopeSupersede" | "Usage" | "Data";

// #region CLASS_MemlensError
/**
 * @purpose Carry a code and a message so the CLI can map errors to exit codes.
 * @invariants Preserve the supplied code and message. The error name is MemlensError.
 */
export class MemlensError extends Error {
	readonly code: ErrorCode;

	constructor(code: ErrorCode, message: string) {
		super(message);
		this.name = "MemlensError";
		this.code = code;
		debug("Error created", { code, message });
	}
}
// #endregion CLASS_MemlensError
