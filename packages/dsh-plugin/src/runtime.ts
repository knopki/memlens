/**
 * #region moduleContract
 * @purpose Give the plugin one base configuration and resolve the active scope from its working directory.
 * @scope Configuration file access, store path precedence, and Git inputs for core scope rules.
 * @invariants An absent or rejected base file selects the shared fallback. Other file errors propagate.
 * @invariants The patch store path wins over the environment and the base file. An empty selected path is an error.
 * @dependencies node:fs, node:child_process, node:path, @memlens/core.
 * @keywords plugin, configuration, scope, git, store, paths
 * #endregion moduleContract
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { debuglog } from "node:util";
import {
	activeScope,
	type BaseConfig,
	DEFAULT_CONFIG_TOML,
	expandTilde,
	loadBaseConfig,
	MemlensError,
	type PatchConfig,
	type ScopeKey,
	storePath,
	validateScopeKey,
	xdgDirs,
} from "@memlens/core";

const debug = debuglog("memlens:plugin:runtime");

// #region FUNC_loadPluginBase
/**
 * @purpose Load the shared base file. A rejected file gives the default base, so no user file
 * blocks a session.
 * @param env - The environment that supplies the XDG roots.
 * @param strict - Reject an invalid file instead of selecting the default layer.
 * @returns The base layer: the file layer, or the default layer after a rejection.
 */
export function loadPluginBase(
	env: Record<string, string | undefined>,
	strict = false,
): BaseConfig {
	const { configDir, dataDir } = xdgDirs(env);
	const path = join(configDir, "config.toml");
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		text = DEFAULT_CONFIG_TOML;
	}
	let base: BaseConfig;
	try {
		base = loadBaseConfig(text, dataDir);
	} catch (error) {
		if (strict) throw error;
		debug("Base rejected; the default base applies", {
			event: "base-reject",
			path,
			error: String(error),
		});
		base = loadBaseConfig(DEFAULT_CONFIG_TOML, dataDir);
	}
	debug("Base loaded", { event: "base", path });
	return base;
}
// #endregion FUNC_loadPluginBase

// #region FUNC_pluginStorePath
/**
 * @purpose Select the same store directory for the host and every preset.
 * @param base - The validated base layer.
 * @param patch - The validated host layer.
 * @param env - The environment that supplies the optional store path and home directory.
 * @returns The absolute store directory.
 */
export function pluginStorePath(
	base: BaseConfig,
	patch: PatchConfig,
	env: Record<string, string | undefined>,
): string {
	const path = expandTilde(
		storePath(patch.store?.path ?? null, env.MEMLENS_STORE ?? null, base.store),
		env,
	);
	if (path.trim().length === 0)
		throw new MemlensError("Data", "The store path is empty.");
	return resolve(path);
}
// #endregion FUNC_pluginStorePath

// #region FUNC_pluginActiveScope
/**
 * @purpose Select the write scope through ordered rules, the repository name, and the configured fallback.
 * @invariants A Git worktree uses the main repository name. A missing Git repository uses the configured fallback.
 * @param base - The base layer that supplies the scope rules.
 * @param cwd - The session working directory.
 * @param workspace - The workspace id, when the harness supplies one.
 * @returns The active scope key.
 */
export function pluginActiveScope(
	base: BaseConfig,
	cwd: string,
	workspace?: string,
): ScopeKey {
	const git = (...args: string[]): string | null => {
		try {
			return (
				execFileSync("git", args, {
					cwd,
					encoding: "utf8",
					stdio: ["ignore", "pipe", "ignore"],
				}).trim() || null
			);
		} catch {
			return null;
		}
	};
	const remote = git("remote", "get-url", "origin");
	const gitRemote =
		remote
			?.replace(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?/i, "")
			.replace(/^[^@/]+@([^:]+):/, "$1/") ?? null;
	const selected = activeScope(base.scope_default, {
		path: cwd,
		gitRemote,
		workspace: workspace ?? null,
	});
	if (selected.rule !== null) return selected.key;
	const common = git("rev-parse", "--path-format=absolute", "--git-common-dir");
	const root = common === null ? null : git("rev-parse", "--show-toplevel");
	if (common !== null && root !== null) {
		const repo =
			basename(common) === ".git" ? basename(dirname(common)) : basename(root);
		const key = `project:${repo.toLowerCase()}`;
		if (validateScopeKey(key)) return key;
	}
	return selected.key;
}
// #endregion FUNC_pluginActiveScope
