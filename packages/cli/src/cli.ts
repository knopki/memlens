/**
 * Command line frontend of memlens.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Let a user start the library from a terminal without the harness.
 * @scope
 *  - Command dispatch, the usage text, and the exit codes.
 *  - NOT: the library logic and the plugin surface.
 * @invariants
 *  - Exit code 0 means success. Exit code 1 means a command error.
 * @usecases
 *  - Command: user => runs the binary => gets the usage text or a result
 * @dependencies USES API: @memlens/core
 * @keywords cli, terminal, memlens
 * #endregion moduleContract
 */
import { pathToFileURL } from "node:url";
import { debuglog } from "node:util";
import { NAME } from "@memlens/core";

const debug = debuglog("memlens:cli");

const USAGE = `Usage: ${NAME} <command>

There are no commands yet. The specification is in docs/spec/.`;

// #region FUNC_main
/**
 * Run one command line.
 *
 * @purpose Turn one command line into an exit code, so the binary has one testable entry.
 * @param argv - The arguments after the binary name.
 * @returns The exit code: 0 for success, 1 for an unknown command.
 */
export function main(argv: readonly string[]): number {
	const first = argv[0];

	debug("Command start", { event: "start", count: argv.length });

	if (first === undefined) {
		process.stdout.write(`${USAGE}\n`);
		debug("Usage written", { event: "end", code: 0 });
		return 0;
	}

	process.stderr.write(`Unknown command: ${first}\n\n${USAGE}\n`);
	debug("Unknown command", { event: "end", code: 1, command: first });
	return 1;
}
// #endregion FUNC_main

const entry = process.argv[1];

if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
	process.exitCode = main(process.argv.slice(2));
}
