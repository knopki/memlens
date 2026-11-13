/**
 * CLI runtime: configuration load and store access.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give each CLI command one opened store and one resolved configuration, so no command
 * reads files or the environment itself.
 * @scope
 *  - The base TOML load with a built-in fallback, the CLI store path order, the profile scopes,
 *    and the visible scope list.
 *  - NOT: command semantics, argument parsing, output formats, and the harness patch.
 * @invariants
 *  - The store path order is --store, then MEMLENS_STORE, then the base file.
 *  - A missing base file falls back to a built-in default configuration with 20 here lines, 10
 *    directions lines, and the sqlite backend, and the CLI writes no file.
 *  - Each runtime owns one row store and the visible scopes of its selected profile.
 *  - Scope rules take precedence over the Git repository name and the configured fallback.
 * @usecases
 *  - Open: command => gives --store and a profile name => gets one runtime and closes it
 * @dependencies USES API: @memlens/core; READS: config.toml, the store directory
 * @keywords runtime, config, store, open, profiles, visible, cli
 * #endregion moduleContract
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { debuglog } from "node:util";
import type { BaseConfig, ResolvedConfig, ScopeKey } from "@memlens/core";
import {
	activeScope,
	expandTilde,
	globMatches,
	isCatalogKey,
	liveCounts,
	loadBaseConfig,
	MemlensError,
	resolveConfig,
	Store,
	storePath,
	validateScopeKey,
	visibleScopes,
	xdgDirs,
} from "@memlens/core";

const debug = debuglog("memlens:runtime");

/** The fallback configuration for a machine with no base file. */
export const DEFAULT_CONFIG_TOML = `language = "en"
defaultProfile = "default"

[store]
idle = 300

[compaction]
provider = "deepseek"
model = "deepseek-chat"
effort = "off"
mode = "auto"
batch = 6
maxCallsPerHour = 120

[profile.default]
scopes = ["*"]

[profile.default.budget]
here = 20
directions = 10

[scope_default]
rules = []
default = "user:notes"
`;

/** One opened CLI runtime: configuration, a row store, and visible profile scopes. */
export interface Runtime {
	readonly base: BaseConfig;
	readonly config: ResolvedConfig;
	readonly path: string;
	readonly store: Store;
	readonly scopes: readonly ScopeKey[];
	readonly profiles: ReadonlyMap<string, readonly ScopeKey[]>;
	close(): Promise<void>;
}

/** Read the base layer: the file of the config directory, or the built-in fallback. */
export function loadCliBaseConfig(
	env: Record<string, string | undefined>,
): BaseConfig {
	const { configDir, dataDir } = xdgDirs(env);
	const text = readCliFile(join(configDir, "config.toml"));
	const layer = loadBaseConfig(text ?? DEFAULT_CONFIG_TOML, dataDir);
	debug("Base layer loaded", {
		event: "base",
		fromFile: text !== null,
		profiles: Object.keys(layer.profile).length,
	});
	return layer;
}

function readCliFile(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

// #region FUNC_openRuntime

/**
 * Resolve the configuration and open the store of the CLI.
 *
 * @purpose Give one command one consistent runtime, so each command sees the same store rules.
 * @invariants The profile name comes from the caller and must exist in the base layer.
 */
export async function openRuntime(options: {
	storeFlag: string | null;
	profile?: string | null;
	env?: Record<string, string | undefined>;
}): Promise<Runtime> {
	const env = options.env ?? process.env;
	const base = loadCliBaseConfig(env);
	const profile = options.profile ?? base.defaultProfile;
	if (base.profile[profile] === undefined) {
		throw new MemlensError(
			"Data",
			`config.profile holds no profile ${profile}`,
		);
	}
	const config = resolveForProfile(base, profile);
	const path = expandTilde(
		storePath(options.storeFlag, env.MEMLENS_STORE ?? null, base.store),
		env,
	);
	const store = new Store(path, config.language);
	const counts = liveCounts(store);
	const known = [...counts.keys()];
	const profiles = new Map(
		Object.entries(base.profile).map(([name, item]) => [
			name,
			visibleScopes(item.scopes, known),
		]),
	);
	const scopes = profiles.get(profile) ?? [];
	debug("Runtime opened", { event: "open", path, profiles: profiles.size });
	return {
		base,
		config,
		path,
		store,
		scopes,
		profiles,
		close: async () => store.close(),
	};
}

// #endregion FUNC_openRuntime

/** Resolve the configuration for one profile name, without a patch and without a preset. */
export function resolveForProfile(
	base: BaseConfig,
	profile: string,
): ResolvedConfig {
	return resolveConfig(base, {}, { profile });
}

/** The visible scope keys of the profile of the runtime. */
export function runtimeVisibleScopes(runtime: Runtime): readonly ScopeKey[] {
	return runtime.scopes;
}

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

/**
 * @purpose Resolve the scope of a directory from rules, Git, and the configured fallback.
 * @invariants A matching rule takes precedence. A Git worktree uses the main repository name.
 */
export function cliScopeResult(
	base: BaseConfig,
	cwd: string,
): { key: ScopeKey; rule: number | null; source: string } {
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
	const result = activeScope(base.scope_default, { path: cwd, gitRemote });
	if (result.rule !== null) return { ...result, source: "rule" };
	const common = git("rev-parse", "--path-format=absolute", "--git-common-dir");
	const root = common === null ? null : git("rev-parse", "--show-toplevel");
	if (common !== null && root !== null) {
		const repo =
			basename(common) === ".git" ? basename(dirname(common)) : basename(root);
		const key = `project:${repo.toLowerCase()}`;
		if (validateScopeKey(key)) return { key, rule: null, source: "git" };
	}
	return { ...result, source: "default" };
}

/** The active scope key of one directory. */
export function cliActiveScope(base: BaseConfig, cwd: string): ScopeKey {
	return cliScopeResult(base, cwd).key;
}
