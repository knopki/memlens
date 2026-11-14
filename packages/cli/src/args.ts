/**
 * Command line argument parsing.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Reject each argument outside the usage of its command, so the CLI reports one usage
 *   error.
 * @scope
 *  - One parse of positional values and flags against a per-command usage.
 *  - NOT: command semantics, value validation, or output formats.
 * @invariants Each command accepts the global flag --store.
 * @usecases
 *  - Parse: command => gives argv and usage => gets positional values and flags or a Usage error
 * @dependencies USES API: @memlens/core errors
 * @keywords args, flags, usage, parse, cli
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { MemlensError } from "@memlens/core";

const debug = debuglog("memlens:args");

/** The usage of one command. */
export interface UsageSpec {
	/** The positional values of the command, by name, in order. A name with ? is optional. */
	readonly positional: readonly string[];

	/** Each flag and its value count: 0, 1, or "many". */
	readonly flags: Readonly<Record<string, 0 | 1 | "many">>;
}

type Flags = Record<string, string | true | readonly string[]>;

/** The parse result of one command line. */
export interface ParsedArgs {
	readonly positional: readonly string[];
	readonly flags: Readonly<Flags>;
}

/** Build one Usage error, so the parse rejects invalid text in one place. */
function usageError(message: string): never {
	debug("Usage rejected", { event: "usage", message });
	throw new MemlensError("Usage", message);
}

// #region FUNC_parseArgs
/**
 * Parse one command line against its usage.
 *
 * @purpose Turn argument text into typed values, so a command reads no argument text itself.
 * @invariants The parse stops at the first argument outside the usage with a Usage error. A bare
 *   value after the last parsed flag is a positional value, and the count of positional values
 *   must not exceed the usage. A missing positional value gives a Usage error.
 */
export function parseArgs(
	argv: readonly string[],
	spec: UsageSpec,
): ParsedArgs {
	const flags: Flags = {};
	const positional: string[] = [];
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		if (arg === undefined) usageError("The command line ends too soon.");
		if (!arg.startsWith("--")) {
			if (positional.length >= spec.positional.length)
				usageError(`The value ${arg} is outside the usage.`);
			positional.push(arg);
			continue;
		}
		index = readFlag(argv, index, arg, spec, flags);
	}
	const missing = spec.positional[positional.length];
	if (missing !== undefined && !missing.endsWith("?"))
		usageError(`The command needs a value: ${missing}.`);
	debug("Args parsed", {
		event: "args",
		positional: positional.length,
		flags: Object.keys(flags).length,
	});
	return { positional, flags };
}
// #endregion FUNC_parseArgs

// #region FUNC_readFlag
/**
 * Read one flag and its value.
 *
 * @purpose Keep the value count rule in one place, so each flag form gives one result.
 * @invariants A flag outside the usage, a missing flag value, or a value on a flag that takes none
 *   gives a Usage error. A flag takes one value in the form --name value or --name=value. A
 *   repeated one-value flag keeps the last value, and a many-value flag keeps each value in order.
 * @returns The index of the last argument that the flag used.
 */
function readFlag(
	argv: readonly string[],
	index: number,
	arg: string,
	spec: UsageSpec,
	flags: Flags,
): number {
	if (arg === "--store") {
		const value = argv[index + 1];
		if (value === undefined) usageError("The flag --store needs a value.");
		flags.store = value;
		return index + 1;
	}
	const equals = arg.indexOf("=");
	const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
	const arity = spec.flags[name];
	if (arity === undefined)
		usageError(`The flag --${name} is outside the usage.`);
	if (arity === 0) {
		if (equals !== -1) usageError(`The flag --${name} takes no value.`);
		flags[name] = true;
		return index;
	}
	const value = equals === -1 ? argv[index + 1] : arg.slice(equals + 1);
	if (value === undefined) usageError(`The flag --${name} needs a value.`);
	if (arity === 1) flags[name] = value;
	else {
		const list = flags[name];
		if (Array.isArray(list)) flags[name] = [...list, value];
		else if (list === undefined) flags[name] = [value];
		else usageError(`The flag --${name} takes one value.`);
	}
	return equals === -1 ? index + 1 : index;
}
// #endregion FUNC_readFlag
