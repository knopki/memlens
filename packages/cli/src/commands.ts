/**
 * Command input and output surface.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give each command one input surface and one answer shape, so no command reads flag text
 *   itself.
 * @scope
 *  - The command IO type, the flag readers, the scope reader, the answer printer, and the runtime
 *    open.
 *  - NOT: the semantics of one command, argument parsing, and the exit code mapping.
 * @invariants Each command closes the runtime that it opens.
 * @usecases
 *  - Flag: command => gives one flag name => gets one typed value
 * @dependencies USES API: @memlens/core
 * @keywords command, io, flag, scope, runtime, answer, json
 * #endregion moduleContract
 */

import { MemlensError, normalizeScopeKey, type ScopeKey } from "@memlens/core";
import type { ParsedArgs } from "./args.js";
import { openRuntime, type Runtime } from "./runtime.js";

/** The input and output surface of one command run. */
export interface CommandIo {
	readonly env: Record<string, string | undefined>;
	readonly cwd: string;

	/** Ask one question and return the answer of the user. False stops the command. */
	confirm(question: string): Promise<boolean>;
}

/** One command answer with its own exit code. */
export interface CommandAnswer {
	readonly text: string;
	readonly code: number;
}

// #region FUNC_flagValue
/**
 * @purpose Give the text of one flag, so a command reads no raw flag value.
 * @returns The value, or null when the command did not give the flag.
 */
export function flagValue(
	flags: ParsedArgs["flags"],
	name: string,
): string | null {
	const value = flags[name];
	return typeof value === "string" ? value : null;
}
// #endregion FUNC_flagValue

// #region FUNC_flagList
/** @purpose Give each value of a many-value flag in order. */
export function flagList(flags: ParsedArgs["flags"], name: string): string[] {
	const value = flags[name];
	if (Array.isArray(value)) return [...value];
	if (typeof value === "string") return [value];
	return [];
}
// #endregion FUNC_flagList

// #region FUNC_countFlag
/**
 * @purpose Read one count flag, so each command rejects a wrong number with one message.
 * @invariants A value outside the digits gives a Usage error.
 */
export function countFlag(
	flags: ParsedArgs["flags"],
	name: string,
	fallback: number,
): number {
	const raw = flagValue(flags, name);
	if (raw === null) return fallback;
	if (!/^\d+$/.test(raw))
		throw new MemlensError("Usage", `The flag --${name} needs a whole number.`);
	return Number(raw);
}
// #endregion FUNC_countFlag

// #region FUNC_scopeList
/** @purpose Read each --scope value in order, so the read commands share one scope list. */
export function scopeList(flags: ParsedArgs["flags"]): ScopeKey[] {
	return flagList(flags, "scope").map(
		(raw) => normalizeScopeKey(raw) as ScopeKey,
	);
}
// #endregion FUNC_scopeList

// #region FUNC_isJson
/** @purpose Tell a JSON answer from a text answer. */
export function isJson(flags: ParsedArgs["flags"]): boolean {
	return flags.json === true;
}
// #endregion FUNC_isJson

// #region FUNC_print
/** @purpose Give the JSON text of one answer. */
export function print(value: unknown): string {
	return JSON.stringify(value, null, 2);
}
// #endregion FUNC_print

// #region FUNC_openCommandRuntime
/**
 * @purpose Open the runtime of one command, so each command reads the store path in one place.
 * @invariants A profile that the base file does not name uses the default profile values.
 */
export async function openCommandRuntime(
	args: ParsedArgs,
	io: CommandIo,
	profile?: string,
): Promise<Runtime> {
	return openRuntime({
		storeFlag: flagValue(args.flags, "store"),
		profile: profile ?? null,
		env: io.env,
	});
}
// #endregion FUNC_openCommandRuntime
