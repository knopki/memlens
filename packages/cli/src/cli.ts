/**
 * Command line frontend of memlens.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Run one command line of the binary memlens and map the result to one exit code, so a
 *   terminal session works with the memory without the harness.
 * @scope
 *  - The program of the binary, the command table, and the exit code mapping.
 *  - NOT: the library logic, the command semantics, and the plugin surface.
 * @invariants
 *  - The binary must run without the harness.
 *  - The exit code marks the result: 0 a success, 1 a data error, 2 a usage error, 3 a policy
 *    refusal.
 *  - commander writes each error of the usage and the help text. The flags --help and --version
 *    give the exit code 0.
 * @usecases
 *  - Command: user => runs the binary => gets the help text or a result
 * @dependencies USES API: @memlens/core, commander
 * @keywords cli, terminal, memlens, dispatch, usage, help, exit code
 * #endregion moduleContract
 */

import { once } from "node:events";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { debuglog } from "node:util";
import { MemlensError, NAME } from "@memlens/core";
import { Command, CommanderError } from "commander";
import { commands as admin } from "./command-admin.js";
import { commands as config } from "./command-config.js";
import { commands as read } from "./command-read.js";
import { commands as transfer } from "./command-transfer.js";
import { commands as write } from "./command-write.js";
import type { CommandIo, Run } from "./commands.js";
import { commands as compact } from "./compact.js";
import { commands as ui } from "./ui.js";

const debug = debuglog("memlens:cli");

/** The version of the package, from the manifest next to the source directory or the build. */
const VERSION: string = createRequire(import.meta.url)(
	"../package.json",
).version;

// #region FUNC_createProgram
/**
 * @purpose Hold each command in one table and throw each commander error, so the help lists each
 *   command and the caller maps the exit code.
 */
function createProgram(run: Run): Command {
	const program = new Command(NAME)
		.description("The long-term memory of an agent.")
		.version(VERSION, "-v, --version")
		.addHelpText(
			"after",
			"\nA target is <pos>, <pos>-<pos>, <scope>#<pos>, or <scope>#<pos>-<pos>.\nEach command takes --store <dir>. The exit codes: 0 success, 1 data, 2 usage, 3 policy.",
		);
	for (const command of [
		...admin(run),
		...compact(run),
		...config(run),
		...read(run),
		...transfer(run),
		...ui(run),
		...write(run),
	])
		program.addCommand(command);
	return program.exitOverride();
}
// #endregion FUNC_createProgram

// #region FUNC_main
/**
 * Run one command line.
 *
 * @purpose Turn one command line into one exit code, so the binary has one testable entry.
 * @invariants The command runs with the environment of the process. A command error writes its
 *   message to the error stream before the return. An error of the usage gives the exit code 2.
 *   A command that returns one CommandAnswer sets its own exit code.
 */
export async function main(
	argv: readonly string[],
	io?: Partial<CommandIo>,
): Promise<number> {
	debug("Command start", {
		event: "start",
		command: argv[0],
		args: argv.length,
	});
	const run: Run = { io: cliIo(io), code: 0 };
	try {
		await createProgram(run).parseAsync([...argv], { from: "user" });
		debug("Command done", { event: "end", code: run.code, command: argv[0] });
		return run.code;
	} catch (error) {
		if (error instanceof CommanderError) {
			const code = error.exitCode === 0 ? 0 : 2;
			debug("Usage error", { event: "end", code, reason: error.code });
			return code;
		}
		const code = exitCode(error);
		const message =
			error instanceof Error ? error.message : "The command failed.";
		process.stderr.write(`${message}\n`);
		debug("Command failed", {
			event: "end",
			code,
			command: argv[0],
			message,
		});
		return code;
	}
}
// #endregion FUNC_main

function cliIo(io: Partial<CommandIo> | undefined): CommandIo {
	return {
		env: io?.env ?? process.env,
		cwd: io?.cwd ?? process.cwd(),
		confirm:
			io?.confirm ??
			(async (question: string) => {
				process.stderr.write(`${question} [y/N] `);
				const reader = createInterface({ input: process.stdin });
				const [line] = await once(reader, "line");
				reader.close();
				return String(line).trim().toLowerCase() === "y";
			}),
	};
}

function exitCode(error: unknown): number {
	if (error instanceof MemlensError)
		return error.code === "Usage" ? 2 : error.code === "NotAllowed" ? 3 : 1;
	return 1;
}

// npm links the binary to this file, so read the link target.
const entry = process.argv[1];

if (
	entry !== undefined &&
	import.meta.url === pathToFileURL(realpathSync(entry)).href
) {
	main(process.argv.slice(2)).then((code) => {
		process.exitCode = code;
	});
}
