/**
 * #region moduleContract
 * @purpose Give the plugin one base configuration and resolve the active scope from its working directory.
 * @scope Configuration file access, store path precedence, and Git inputs for core scope rules.
 * @invariants The base read never throws. An absent or rejected file gives the default layer, and a
 *   rejected file states its error text.
 * @invariants The patch store path wins over the environment and the base file. An empty selected path is an error.
 * @dependencies USES API: node:fs, node:path, @memlens/core
 * @keywords plugin, configuration, scope, git, store, paths
 * #endregion moduleContract
 */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { debuglog } from "node:util";
import {
	type BaseConfig,
	expandTilde,
	loadBaseConfig,
	MemlensError,
	nativeDirs,
	type PatchConfig,
	resolveScopeContext,
	type ScopeKey,
	storePath,
} from "@memlens/core";

const debug = debuglog("memlens:plugin:runtime");

// #region INTERFACE_BaseRead
/** The result of one read of the shared base file. */
export interface BaseRead {
	/** The base layer: the file layer, or the default layer when the read gave no layer. */
	readonly base: BaseConfig;

	/** True when the path holds a file or another object, so the read found something present. */
	readonly present: boolean;

	/** The text of the failure of the same read, or null when the read gave a layer. */
	readonly error: string | null;
}
// #endregion INTERFACE_BaseRead

/** The message of an Error, or the string of any other value. */
function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

// #region FUNC_readPluginBase
/**
 * @purpose Load the shared base file, state whether the path held something, and state the failure
 * of a read that gave no layer.
 * @invariants The read never throws, so no configuration failure stops a session.
 * @invariants The presence comes from the read outcome, so no second check of the path runs beside
 *   the read and no absence can hide behind a check.
 * @invariants An absent file gives the default layer. A present file that no read can parse or take
 *   gives the default layer and the error text, so the caller opens a store and states the failure.
 * @invariants An unknown root gives the default layer with an empty store path and the error text.
 *   The empty path fails the open of the store, so no store starts under the working directory.
 * @param env - The environment that supplies the native roots and the home directory.
 */
export function readPluginBase(
	env: Record<string, string | undefined>,
): BaseRead {
	let dirs: { configDir: string; dataDir: string };
	try {
		dirs = nativeDirs(env);
	} catch (cause) {
		const error = errorText(cause);
		debug("Native directories unknown", { event: "dirs-error", error });
		return { base: loadBaseConfig(null, ""), present: false, error };
	}
	const { configDir, dataDir } = dirs;
	const path = join(configDir, "config.toml");
	let text: string | null = null;
	let present = false;
	let error: string | null = null;
	try {
		text = readFileSync(path, "utf8");
		present = true;
	} catch (cause) {
		// A path that holds a directory or a file with no permission is present, so the failure
		// states an error and no read claims the default layer as the file layer.
		if ((cause as NodeJS.ErrnoException).code !== "ENOENT") {
			present = true;
			error = errorText(cause);
		}
	}
	let base: BaseConfig;
	if (text === null) {
		base = loadBaseConfig(null, dataDir);
	} else {
		try {
			base = loadBaseConfig(text, dataDir);
		} catch (cause) {
			error ??= errorText(cause);
			base = loadBaseConfig(null, dataDir);
		}
	}
	if (error !== null)
		debug("Base rejected; the default base applies", {
			event: "base-reject",
			path,
			error,
		});
	debug("Base loaded", { event: "base", path, present });
	return { base, present, error };
}
// #endregion FUNC_readPluginBase

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
 * @purpose Select the write scope through ordered rules and the working context.
 * @invariants A Git worktree uses the main repository name.
 * @param base - The base layer that supplies the scope rules.
 * @param cwd - The session working directory.
 * @param workspace - The workspace id, when the harness supplies one.
 * @param workspaceName - The workspace title, when the harness supplies one.
 * @returns The active scope key.
 */
export function pluginActiveScope(
	base: BaseConfig,
	cwd: string,
	workspace?: string,
	workspaceName?: string,
): ScopeKey {
	return resolveScopeContext(base.scope_default, cwd, workspace, workspaceName)
		.key;
}
// #endregion FUNC_pluginActiveScope
