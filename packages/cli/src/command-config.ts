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
 * @dependencies USES API: @memlens/core, smol-toml, runtime.ts; READS: config.toml
 * @keywords config, toml, show, resolved, cli
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import { MemlensError } from "@memlens/core";
import { stringify as stringifyToml } from "smol-toml";
import type { ParsedArgs } from "./args.js";
import type { CommandIo } from "./commands.js";
import { loadCliBaseConfig, resolveForProfile } from "./runtime.js";

const debug = debuglog("memlens:commands");

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
export function configCommand(args: ParsedArgs, io: CommandIo): string {
	const action = args.positional[0];
	if (action !== "show")
		throw new MemlensError("Usage", "The action must be show.");
	const base = loadCliBaseConfig(io.env);
	const selected = args.flags.profile;
	const profile = typeof selected === "string" ? selected : base.defaultProfile;
	const config = resolveForProfile(base, profile);
	const plain = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
	const json = args.flags.json === true;
	debug("Config shown", { event: "config", profile, json });
	return json
		? JSON.stringify(plain, null, 2)
		: stringifyToml(plain as Parameters<typeof stringifyToml>[0]);
}
// #endregion FUNC_configCommand
