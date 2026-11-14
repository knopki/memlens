/**
 * Command line frontend of memlens.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Run one command line of the binary memlens and map the result to one exit code, so a
 *   terminal session works with the memory without the harness.
 * @scope
 *  - The dispatch of one command line, the usage text, and the exit code mapping.
 *  - NOT: the library logic, the command semantics, and the plugin surface.
 * @invariants
 *  - The binary must run without the harness.
 *  - The exit code marks the result: 0 a success, 1 a data error, 2 a usage error, 3 a policy
 *    refusal.
 * @usecases
 *  - Command: user => runs the binary => gets the usage text or a result
 * @dependencies USES API: @memlens/core, args.ts, commands.ts, command-*.ts, compact.ts, ui.ts
 * @keywords cli, terminal, memlens, dispatch, usage, exit code
 * #endregion moduleContract
 */

import { once } from "node:events";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { debuglog } from "node:util";
import { MemlensError, NAME } from "@memlens/core";
import type { ParsedArgs, UsageSpec } from "./args.js";
import { parseArgs } from "./args.js";
import { checkCommand, repairCommand, statusCommand } from "./command-admin.js";
import { configCommand } from "./command-config.js";
import {
	findCommand,
	openCommand,
	scopeCommand,
	scopesCommand,
	sliceCommand,
} from "./command-read.js";
import { exportCommand, importCommand } from "./command-transfer.js";
import {
	amendCommand,
	forgetCommand,
	noteCommand,
	redactCommand,
	reviewCommand,
} from "./command-write.js";
import type { CommandAnswer, CommandIo } from "./commands.js";
import { compactCommand } from "./compact.js";
import { uiCommand } from "./ui.js";

const debug = debuglog("memlens:cli");

/** The usage text of the binary. */
const USAGE = `Usage: ${NAME} <command> [flags]

  note <body> [--scope key] [--longform file.md] [--kind kind] [--supersedes 12,14] [--review 180d|never]
  find <words> [--scope key]... [--since date] [--until date] [--due] [--limit 10] [--json]
  open <target> [--scope key] [--no-longform] [--offset N] [--json]
  forget <target> [--scope key] [--reason "text"]
  review [--scope key]... [--limit 50] [--json]
  review --mark <target>,<target> [--scope key] [--for 180d]
  redact <target> [--scope key] [--reason "text"] [--yes]
  amend <target> [--scope key] [--body "text"] [--longform file.md] [--kind kind] [--supersedes 12,14]
  scopes [--json]
  scope
  slice [--profile name] [--scope key] [--json]
  compact [--scope key] [--max 50] [--dry-run]
  compact --answer path [--scope key]
  status [--json]
  check [--json]
  repair [--dry-run]
  export --format md|jsonl --out dir [--scope key]
  import --in path [--as key] [--dry-run]
  config get|set key [value]
  ui [--port 7788] [--allow-delete]

A target is <pos>, <pos>-<pos>, <scope>#<pos>, or <scope>#<pos>-<pos>.
Each command takes --store dir. The exit codes: 0 success, 1 data, 2 usage, 3 policy.`;

type Command = {
	readonly run: (
		args: ParsedArgs,
		io: CommandIo,
	) => Promise<string | CommandAnswer> | string | CommandAnswer;
	readonly spec: UsageSpec;
};

const COMMANDS: Readonly<Record<string, Command>> = {
	note: {
		run: noteCommand,
		spec: {
			positional: ["body"],
			flags: { scope: 1, longform: 1, kind: 1, supersedes: 1, review: 1 },
		},
	},
	find: {
		run: findCommand,
		spec: {
			positional: ["words"],
			flags: { scope: "many", since: 1, until: 1, due: 0, limit: 1, json: 0 },
		},
	},
	open: {
		run: openCommand,
		spec: {
			positional: ["target"],
			flags: { scope: 1, "no-longform": 0, offset: 1, json: 0 },
		},
	},
	forget: {
		run: forgetCommand,
		spec: { positional: ["target"], flags: { scope: 1, reason: 1 } },
	},
	review: {
		run: reviewCommand,
		spec: {
			positional: [],
			flags: { scope: "many", limit: 1, json: 0, mark: 1, for: 1 },
		},
	},
	redact: {
		run: redactCommand,
		spec: { positional: ["target"], flags: { scope: 1, reason: 1, yes: 0 } },
	},
	amend: {
		run: amendCommand,
		spec: {
			positional: ["target"],
			flags: { scope: 1, body: 1, longform: 1, kind: 1, supersedes: 1 },
		},
	},
	scopes: { run: scopesCommand, spec: { positional: [], flags: { json: 0 } } },
	scope: {
		run: (_args, io) => scopeCommand(io),
		spec: { positional: [], flags: {} },
	},
	slice: {
		run: sliceCommand,
		spec: { positional: [], flags: { profile: 1, scope: 1, json: 0 } },
	},
	compact: {
		run: compactCommand,
		spec: {
			positional: [],
			flags: { scope: 1, max: 1, "dry-run": 0, answer: 1 },
		},
	},
	status: { run: statusCommand, spec: { positional: [], flags: { json: 0 } } },
	check: { run: checkCommand, spec: { positional: [], flags: { json: 0 } } },
	repair: {
		run: repairCommand,
		spec: { positional: [], flags: { "dry-run": 0 } },
	},
	export: {
		run: exportCommand,
		spec: { positional: [], flags: { format: 1, out: 1, scope: 1 } },
	},
	import: {
		run: importCommand,
		spec: { positional: [], flags: { in: 1, as: 1, "dry-run": 0 } },
	},
	ui: {
		run: uiCommand,
		spec: { positional: [], flags: { port: 1, "allow-delete": 0 } },
	},
	config: {
		run: (args, io) => configCommand(args, io),
		spec: { positional: ["action", "key", "value?"], flags: {} },
	},
};

// #region FUNC_main
/**
 * Run one command line.
 *
 * @purpose Turn one command line into one exit code, so the binary has one testable entry.
 * @invariants The command runs with the environment of the process. A command error writes its
 *   message to the error stream before the return. An unknown command or no command is an error of
 *   the usage. A command that returns one CommandAnswer sets its own exit code.
 */
export async function main(
	argv: readonly string[],
	io?: Partial<CommandIo>,
): Promise<number> {
	const command = argv[0];
	debug("Command start", { event: "start", command, args: argv.length });
	if (command === undefined || COMMANDS[command] === undefined) {
		const text =
			command === undefined ? "No command." : `Unknown command: ${command}`;
		process.stderr.write(`${text}\n\n${USAGE}\n`);
		debug("Usage error", { event: "end", code: 2, command });
		return 2;
	}
	const entry = COMMANDS[command];
	try {
		const args = parseArgs(argv.slice(1), entry.spec);
		const answer = await entry.run(args, cliIo(io));
		const text = typeof answer === "string" ? answer : answer.text;
		const code = typeof answer === "string" ? 0 : answer.code;
		if (text !== "") process.stdout.write(`${text}\n`);
		debug("Command done", { event: "end", code, command });
		return code;
	} catch (error) {
		const code = exitCode(error);
		const message =
			error instanceof Error ? error.message : "The command failed.";
		process.stderr.write(`${message}\n`);
		debug("Command failed", { event: "end", code, command, message });
		return code;
	}
}
// #endregion FUNC_main

function cliIo(io?: Partial<CommandIo>): CommandIo {
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

const entry = process.argv[1];

if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
	main(process.argv.slice(2)).then((code) => {
		process.exitCode = code;
	});
}
