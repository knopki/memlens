/**
 * Configuration command.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Show the resolved configuration of this machine, so a user sees each value that the
 *   commands use.
 * @scope
 *  - The command config show, the base layer, and the built-in defaults.
 *  - NOT: the plugin patch, the preset, and the store.
 * @invariants The command opens no store.
 * @invariants The answer holds every key of the resolved configuration, and a dotted path names no
 *   single key.
 * @dependencies USES API: @memlens/core, smol-toml, commander; READS: config.toml
 * @keywords config, toml, show, resolved, cli
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { Command } from "commander";
import { stringify as stringifyToml } from "smol-toml";
import {
	type CommandIo,
	command,
	JSON_FLAG,
	type Run,
	reply,
} from "./commands.js";
import { loadCliBaseConfig, resolveForProfile } from "./runtime.js";

const debug = debuglog("memlens:commands");

// #region FUNC_commands
/**
 * @purpose Declare the signature and the flags of the command once, so the help comes from the
 *   same place as the parse.
 */
export function commands(run: Run): Command[] {
	return [
		command(
			"config",
			"Show the resolved configuration of this machine.",
		).addCommand(
			command("show", "Print each value that the commands use.")
				.option(
					"--profile <name>",
					"The profile of the configuration. The default profile applies without the flag.",
				)
				.addOption(JSON_FLAG)
				.action((options) => reply(run, configCommand(options, run.io))),
		),
	];
}
// #endregion FUNC_commands

// #region FUNC_configCommand
/**
 * Show the resolved configuration.
 *
 * @purpose Print each value that the commands use, so a user reads the result of the layers without
 *   the merge order in mind.
 * @invariants A missing base file gives the built-in defaults, so the command always prints a
 *   complete configuration. The flag --profile selects the profile, and the default profile applies
 *   without the flag.
 * @returns The configuration as TOML, or as JSON with the flag --json.
 */
export function configCommand(
	input: { profile?: string; json?: boolean },
	io: CommandIo,
): string {
	const base = loadCliBaseConfig(io.env);
	const profile = input.profile ?? base.defaultProfile;
	const config = resolveForProfile(base, profile);
	const plain = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
	debug("Config shown", { event: "config", profile, json: input.json });
	return input.json
		? JSON.stringify(plain, null, 2)
		: stringifyToml(plain as Parameters<typeof stringifyToml>[0]);
}
// #endregion FUNC_configCommand
