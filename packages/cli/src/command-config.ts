/**
 * Configuration command.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Read and write one key of config.toml from the terminal, so a user tunes the machine
 *   without an editor.
 * @scope
 *  - The command config with the actions get and set, and the dotted key path.
 *  - NOT: the configuration schema and the store.
 * @invariants The command opens no store.
 * @dependencies USES API: @memlens/core, smol-toml, commands.ts; WRITES: config.toml
 * @keywords config, toml, key, get, set, cli
 * #endregion moduleContract
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { debuglog } from "node:util";
import { loadBaseConfig, MemlensError, xdgDirs } from "@memlens/core";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import type { ParsedArgs } from "./args.js";
import type { CommandIo } from "./commands.js";
import { DEFAULT_CONFIG_TOML, readCliFile } from "./runtime.js";

const debug = debuglog("memlens:commands");

// #region FUNC_configCommand
/**
 * Read or write one configuration key.
 *
 * @purpose Show one value of config.toml, or set one value, so a user tunes the machine without
 *   an editor.
 * @invariants A dotted path names one key of the configuration. The set writes the file only after
 *   the complete result passes the base load.
 */
export function configCommand(args: ParsedArgs, io: CommandIo): string {
	const action = args.positional[0];
	if (action !== "get" && action !== "set")
		throw new MemlensError("Usage", "The action must be get or set.");
	const key = args.positional[1];
	if (key === undefined)
		throw new MemlensError("Usage", "The command needs a key.");
	const { configDir, dataDir } = xdgDirs(io.env);
	const path = join(configDir, "config.toml");
	const raw = parseToml(readCliFile(path) ?? DEFAULT_CONFIG_TOML) as Record<
		string,
		unknown
	>;
	if (action === "get") {
		const value = walk(raw, key.split("."));
		debug("Config read", { event: "config", key });
		return `${key}: ${renderTomlValue(value)}`;
	}
	const value = args.positional[2];
	if (value === undefined)
		throw new MemlensError("Usage", "The command set needs a value.");
	const text = stringifyToml(setPath(raw, key.split("."), parseValue(value)));
	loadBaseConfig(text, dataDir);
	mkdirSync(configDir, { recursive: true });
	writeFileSync(path, text);
	debug("Config written", { event: "config", key, path });
	return `set ${key}`;
}
// #endregion FUNC_configCommand

function walk(value: unknown, path: readonly string[]): unknown {
	let current = value;
	for (const part of path) {
		if (typeof current !== "object" || current === null)
			throw new MemlensError("Data", `The key part ${part} is not a table.`);
		current = (current as Record<string, unknown>)[part];
		if (current === undefined)
			throw new MemlensError("Data", `The configuration holds no key ${part}.`);
	}
	return current;
}

function setPath(
	value: Record<string, unknown>,
	path: readonly string[],
	next: unknown,
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...value };
	let current = result;
	for (const part of path.slice(0, -1)) {
		const child = current[part];
		if (typeof child !== "object" || child === null)
			throw new MemlensError("Data", `The key part ${part} is not a table.`);
		const copy = { ...(child as Record<string, unknown>) };
		current[part] = copy;
		current = copy;
	}
	current[path.at(-1) ?? ""] = next;
	return result;
}

function parseValue(raw: string): unknown {
	if (raw === "true") return true;
	if (raw === "false") return false;
	if (/^-?\d+$/.test(raw)) return Number(raw);
	return raw;
}

function renderTomlValue(value: unknown): string {
	if (value === null) return "null";
	if (typeof value === "object") return JSON.stringify(value);
	return String(value);
}
