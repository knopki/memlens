/**
 * Command input and output surface.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give each command the shared flags, the value readers, and one answer shape, so no
 *   command reads the environment or the argument text itself.
 * @scope
 *  - The run type, the command constructor, the shared flags, the value readers, the input file
 *    reader, and the answer printer.
 *  - NOT: the semantics of one command, the dispatch, and the exit code mapping.
 * @invariants
 *  - Each command closes the runtime that it opens.
 *  - A command rejects a positional value outside its signature.
 *  - A short flag has one meaning in each command.
 * @usecases
 *  - Open: command => gives its io => gets one runtime and closes it
 * @dependencies USES API: @memlens/core, commander
 * @keywords command, io, flag, scope, runtime, answer, json, input file
 * #endregion moduleContract
 */

import { readFileSync, statSync } from "node:fs";
import type { ScopeKey } from "@memlens/core";
import {
	MAX_ADD_DAYS,
	MemlensError,
	NOTE_KINDS,
	normalizeScopeKey,
	parseDay,
	parseNoteTime,
} from "@memlens/core";
import { Command, InvalidArgumentError, Option } from "commander";
import { openRuntime, type Runtime } from "./runtime.js";

/** The input and output surface of one command run. */
export interface CommandIo {
	readonly env: Record<string, string | undefined>;
	readonly cwd: string;

	/**
	 * Ask one question. The answer is true or false, or null when the input closed before a line.
	 */
	confirm(question: string): Promise<boolean | null>;
}

/** One run of one command line: its input surface and the exit code of its answer. */
export interface Run {
	readonly io: CommandIo;

	/** The exit code of the answer. The run starts at 0, and a command sets a value of its own. */
	code: number;
}

/** One command answer with its own exit code. */
export interface CommandAnswer {
	readonly text: string;
	readonly code: number;
}

// #region FUNC_command
/**
 * @purpose Make one command of the binary, so each command rejects a positional value outside its
 *   signature and throws its errors instead of the exit of the process.
 * @invariants The signature holds the name and the positional values, in the form of commander.
 */
export function command(signature: string, description: string): Command {
	const [, name = "", args = ""] = /^(\S+) *(.*)/.exec(signature) ?? [];
	const cmd = new Command(name)
		.description(description)
		.allowExcessArguments(false)
		.exitOverride();
	return args === "" ? cmd : cmd.arguments(args);
}
// #endregion FUNC_command

// #region FUNC_reply
/**
 * @purpose Print the answer of one command and keep its exit code, so a command only returns its
 *   answer.
 * @invariants An empty answer prints nothing. A string gives the exit code 0.
 */
export async function reply(
	run: Run,
	answer: string | CommandAnswer | Promise<string | CommandAnswer>,
): Promise<void> {
	const value = await answer;
	const text = typeof value === "string" ? value : value.text;
	if (typeof value !== "string") run.code = value.code;
	if (text !== "") process.stdout.write(`${text}\n`);
}
// #endregion FUNC_reply

/** Read one whole number, so the engine never receives a value above the safe range. */
export function whole(value: string): number {
	if (!/^\d+$/.test(value))
		throw new InvalidArgumentError("needs a whole number.");
	const number = Number(value);
	if (number > Number.MAX_SAFE_INTEGER)
		throw new InvalidArgumentError(
			`must be at most ${Number.MAX_SAFE_INTEGER}.`,
		);
	return number;
}

/** Read one value of a list, so a wrong value names the allowed values. */
export function oneOf(values: readonly string[]): (value: string) => string {
	return (value) => {
		if (!values.includes(value))
			throw new InvalidArgumentError(
				`allowed choices are ${values.join(", ")}.`,
			);
		return value;
	};
}

/** Collect each repetition of one flag in one list. */
export function collect(value: string, previous: string[] = []): string[] {
	return [...previous, value];
}

/** Split one list of addresses in the form 12,14. */
export function addressList(value: string): string[] {
	return value.split(",").filter((item) => item !== "");
}

/** The greatest size of one input file, in bytes. The commands read no larger file. */
const MAX_INPUT_BYTES = 256 * 1024 * 1024;

// #region FUNC_readInputText
/**
 * @purpose Read one input file whole after the size check, so one oversized file cannot exhaust
 *   the memory before a command rejects it.
 */
export function readInputText(path: string): string {
	let text: string;
	try {
		const { size } = statSync(path);
		if (size > MAX_INPUT_BYTES)
			throw new MemlensError(
				"Data",
				`The file ${path} is larger than ${MAX_INPUT_BYTES} bytes.`,
			);
		text = readFileSync(path, "utf8");
	} catch (cause) {
		if (cause instanceof MemlensError) throw cause;
		throw new MemlensError("Data", `The file ${path} does not read.`);
	}
	return text;
}
// #endregion FUNC_readInputText

/** Read one review period: a number of days with the letter d, or never. */
export function period(value: string): string {
	if (!/^\d+d$|^never$/.test(value))
		throw new InvalidArgumentError(
			"needs a number of days with the letter d, or never.",
		);
	if (Number(value.slice(0, -1)) > MAX_ADD_DAYS)
		throw new InvalidArgumentError(`must be at most ${MAX_ADD_DAYS} days.`);
	return value;
}

/** Read one time of a note: a day or an ISO 8601 time, in the stored form. */
export function noteTime(value: string): string {
	const time = parseNoteTime(value);
	if (time === null)
		throw new InvalidArgumentError("needs a day or an ISO 8601 time.");
	return time;
}

// #region FUNC_day
/**
 * @purpose Read the day of one flag, so a command refuses a text that is not a day of the calendar.
 * @ensures The result is a day of the calendar, or the read throws an argument error.
 */
export function day(value: string): string {
	const result = parseDay(value);
	if (result === null)
		throw new InvalidArgumentError("needs a day, as YYYY-MM-DD.");
	return result;
}
// #endregion FUNC_day

/** Read one port of the console. */
export function port(value: string): number {
	const number = whole(value);
	if (number < 1 || number > 65535)
		throw new InvalidArgumentError("must be between 1 and 65535.");
	return number;
}

const kindOf = oneOf(NOTE_KINDS);

/** The flag --store of each command that opens the store. */
export const STORE = new Option(
	"--store <dir>",
	"The directory of the store. Without the flag, MEMLENS_STORE gives the path, then the base file.",
);

/** The flag -s, --scope of each command that takes one scope key. */
export const SCOPE = new Option("-s, --scope <key>", "The scope key.");

/** The flag -s, --scope of each command that takes a list of scope keys. */
export const SCOPES = new Option(
	"-s, --scope <key>",
	"A scope key. Repeat the flag for each scope.",
).argParser(collect);

/** The flag -k, --kind of each command that takes one kind. */
export const KIND = new Option(
	"-k, --kind <kind>",
	"The kind of the note.",
).argParser(kindOf);

/** The flag -k, --kind of each command that takes a list of kinds. */
export const KINDS = new Option(
	"-k, --kind <kind>",
	"A kind. Repeat the flag for each kind.",
).argParser((value: string, previous: string[] = []) => [
	...previous,
	kindOf(value),
]);

/** The flag -l, --limit of each command that cuts one list. */
export function limit(fallback: number): Option {
	return new Option("-l, --limit <n>", "The most records of the answer.")
		.argParser(whole)
		.default(fallback);
}

/** The flag --json of each command that gives one answer in two forms. */
export const JSON_FLAG = new Option("--json", "Give the answer as JSON.");

/** The flag --dry-run of each command that can plan its change. */
export const DRY_RUN = new Option(
	"--dry-run",
	"Plan the change and write nothing.",
);

/** The flag -r, --reason of each command that records a reason. */
export const REASON = new Option(
	"-r, --reason <text>",
	"The reason of the change.",
);

// #region FUNC_scopeList
/**
 * @purpose Give each scope key of one scope list, so the read commands share one reader.
 * @invariants No flag gives an empty list.
 */
export function scopeList(raw: readonly string[]): ScopeKey[] {
	return raw.map((key) => normalizeScopeKey(key) as ScopeKey);
}
// #endregion FUNC_scopeList

// #region FUNC_checkedScope
/**
 * @purpose Read one scope key and keep only a scope that the profile lists, so each command shares
 *   one visibility rule.
 */
export function checkedScope(runtime: Runtime, raw: string): ScopeKey {
	const scope = normalizeScopeKey(raw) as ScopeKey;
	if (!runtime.scopes.includes(scope))
		throw new MemlensError("NotAllowed", `The scope ${scope} is not visible.`);
	return scope;
}
// #endregion FUNC_checkedScope

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
	io: CommandIo,
	store: string | undefined,
	profile?: string,
): Promise<Runtime> {
	return openRuntime({
		storeFlag: store ?? null,
		profile: profile ?? null,
		env: io.env,
	});
}
// #endregion FUNC_openCommandRuntime
