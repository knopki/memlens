/**
 * CLI runtime: configuration load and store access.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give each CLI command one opened store and one resolved configuration, so no command
 * reads files or the environment itself.
 * @scope
 *  - The base TOML load, the CLI store path order, the profile scopes, and the visible scope list.
 *  - The active scope of one directory: the configured rules, then the automatic list.
 *  - NOT: command semantics, argument parsing, output formats, and the harness patch.
 * @invariants
 *  - The store path order is --store, then MEMLENS_STORE, then the base file.
 *  - A missing base file gives the default layer without a parser, and the CLI writes no file.
 *  - Each runtime owns one row store and the visible scopes of its selected profile.
 *  - Scope rules take precedence over the automatic list: the Git remote, the repository name,
 *    the directory name, and the fallback key of `scope_default.default`.
 *  - The rules read the canonical remote, and the automatic list reads the Git form.
 *  - The Git remote is origin when it exists, and the first remote otherwise.
 * @usecases
 *  - Open: command => gives --store and a profile name => gets one runtime and closes it
 *  - Scope: command => gives one directory => gets the key, its rule, and the verdict of each rule
 * @dependencies USES API: @memlens/core; READS: config.toml, the store directory
 * @keywords runtime, config, store, open, profiles, visible, cli
 * #endregion moduleContract
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { debuglog } from "node:util";
import type {
	BaseConfig,
	ResolvedConfig,
	ScopeContextResult,
	ScopeKey,
} from "@memlens/core";
import {
	expandTilde,
	globMatches,
	isCatalogKey,
	liveCounts,
	loadBaseConfig,
	nativeDirs,
	resolveConfig,
	resolveScopeContext,
	Store,
	storePath,
	visibleScopes,
} from "@memlens/core";

const debug = debuglog("memlens:runtime");

/** One opened CLI runtime: configuration, a row store, and visible profile scopes. */
export interface Runtime {
	readonly base: BaseConfig;
	readonly config: ResolvedConfig;
	readonly path: string;
	readonly store: Store;
	readonly scopes: readonly ScopeKey[];
	close(): Promise<void>;
}

// #region FUNC_loadCliBaseConfig
/** Read the base layer: the file of the config directory, or the defaults for an absent file. */
export function loadCliBaseConfig(
	env: Record<string, string | undefined>,
): BaseConfig {
	const { configDir, dataDir } = nativeDirs(env);
	const text = readCliFile(join(configDir, "config.toml"));
	const layer = loadBaseConfig(text, dataDir);
	debug("Base layer loaded", {
		event: "base",
		fromFile: text !== null,
		profiles: Object.keys(layer.profile).length,
	});
	return layer;
}
// #endregion FUNC_loadCliBaseConfig

// #region FUNC_readCliFile
/** @purpose Read one configuration file, and give null when the file is absent. */
export function readCliFile(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}
// #endregion FUNC_readCliFile

// #region FUNC_openRuntime
/**
 * Resolve the configuration and open the store of the CLI.
 *
 * @purpose Give one command one consistent runtime, so each command sees the same store rules.
 * @invariants A profile that the base file does not name uses the default profile values that
 *   `resolveConfig` gives, so no config state fails the open.
 */
export async function openRuntime(options: {
	storeFlag: string | null;
	profile?: string | null;
	env?: Record<string, string | undefined>;
}): Promise<Runtime> {
	const env = options.env ?? process.env;
	const base = loadCliBaseConfig(env);
	const profile = options.profile ?? base.defaultProfile;
	const config = resolveForProfile(base, profile);
	const path = expandTilde(
		storePath(options.storeFlag, env.MEMLENS_STORE ?? null, base.store),
		env,
	);
	const store = new Store(path, config.language);
	const known = [...liveCounts(store).keys()];
	const scopes = visibleScopes(config.profile.scopes, known);
	debug("Runtime opened", {
		event: "open",
		path,
		profiles: Object.keys(base.profile).length,
	});
	return {
		base,
		config,
		path,
		store,
		scopes,
		close: async () => store.close(),
	};
}
// #endregion FUNC_openRuntime

// #region FUNC_resolveForProfile
/** Resolve the configuration for one profile name, without a patch and without a preset. */
export function resolveForProfile(
	base: BaseConfig,
	profile: string,
): ResolvedConfig {
	return resolveConfig(base, {}, { profile });
}
// #endregion FUNC_resolveForProfile

// #region FUNC_profileLists
/**
 * @purpose Tell a listed scope from a scope that needs a proposal.
 * @invariants A listed glob matches the scope. A catalog key is never listed.
 */
export function profileLists(runtime: Runtime, scope: ScopeKey): boolean {
	return (
		!isCatalogKey(scope) &&
		runtime.config.profile.scopes.some((glob) => globMatches(glob, scope))
	);
}
// #endregion FUNC_profileLists

// #region FUNC_cliScopeResult
/**
 * @purpose Resolve the scope of a directory from the rules and the automatic list.
 * @invariants A matching rule takes precedence over the automatic list.
 * @invariants The rules read the canonical remote, and the automatic list reads the Git form.
 * @invariants A Git worktree uses the name of the main repository.
 * @invariants The remote is origin when it exists, and the first remote otherwise.
 */
export function cliScopeResult(
	base: BaseConfig,
	cwd: string,
): ScopeContextResult {
	return resolveScopeContext(base.scope_default, cwd);
}
// #endregion FUNC_cliScopeResult

// #region FUNC_cliActiveScope
/** The active scope key of one directory. */
export function cliActiveScope(base: BaseConfig, cwd: string): ScopeKey {
	return cliScopeResult(base, cwd).key;
}
// #endregion FUNC_cliActiveScope
