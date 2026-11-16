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
 *  - The active scope of one directory: the configured rules, then the automatic list.
 *  - NOT: command semantics, argument parsing, output formats, and the harness patch.
 * @invariants
 *  - The store path order is --store, then MEMLENS_STORE, then the base file.
 *  - A missing base file falls back to the built-in default configuration, and the CLI writes no
 *    file.
 *  - Each runtime owns one row store and the visible scopes of its selected profile.
 *  - Scope rules take precedence over the automatic list: the Git remote, the repository name,
 *    the directory name, and the fallback `project:misc`.
 *  - The Git remote is origin when it exists, and the first remote otherwise.
 * @usecases
 *  - Open: command => gives --store and a profile name => gets one runtime and closes it
 *  - Scope: command => gives one directory => gets the key, its rule, and its source
 * @dependencies USES API: @memlens/core; READS: config.toml, the store directory
 * @keywords runtime, config, store, open, profiles, visible, cli
 * #endregion moduleContract
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { debuglog } from "node:util";
import type {
	BaseConfig,
	ResolvedConfig,
	ScopeKey,
	ScopeSubject,
} from "@memlens/core";
import {
	activeScope,
	automaticScope,
	DEFAULT_CONFIG_TOML,
	expandTilde,
	globMatches,
	isCatalogKey,
	liveCounts,
	loadBaseConfig,
	MemlensError,
	resolveConfig,
	Store,
	storePath,
	visibleScopes,
	xdgDirs,
} from "@memlens/core";

const debug = debuglog("memlens:runtime");

/** Preserve the CLI export of the shared fallback configuration. */
export { DEFAULT_CONFIG_TOML } from "@memlens/core";

/** One opened CLI runtime: configuration, a row store, and visible profile scopes. */
export interface Runtime {
	readonly base: BaseConfig;
	readonly config: ResolvedConfig;
	readonly path: string;
	readonly store: Store;
	readonly scopes: readonly ScopeKey[];
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

export function readCliFile(path: string): string | null {
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
	const known = [...liveCounts(store).keys()];
	const scopes = visibleScopes(base.profile[profile]?.scopes ?? [], known);
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

/** Resolve the configuration for one profile name, without a patch and without a preset. */
export function resolveForProfile(
	base: BaseConfig,
	profile: string,
): ResolvedConfig {
	return resolveConfig(base, {}, { profile });
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
 * @purpose Resolve the scope of a directory from the rules and the automatic list.
 * @invariants A matching rule takes precedence over the automatic list.
 * @invariants A Git worktree uses the name of the main repository.
 * @invariants The remote is origin when it exists, and the first remote otherwise.
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
	const remote = selectedRemote(git);
	const subject: ScopeSubject = {
		gitRemote: remote === null ? null : normalizedRemote(remote),
		path: cwd,
		workspace: null,
		workspaceName: null,
		repo: repositoryName(git),
	};
	const result = activeScope(base.scope_default, subject);
	if (result.rule !== null) return { ...result, source: "rule" };
	const automatic = automaticScope({ ...subject, gitRemote: remote });
	debug("Scope selected automatically", {
		event: "scope",
		key: automatic.key,
		source: automatic.source,
	});
	return { key: automatic.key, rule: null, source: automatic.source };
}

// #region FUNC_selectedRemote
/**
 * @purpose Select the one remote URL of a directory, so each caller reads the same remote.
 * @invariants The remote origin wins, and the first remote applies when origin is absent.
 * @invariants A missing repository or remote gives null.
 * @param git - The Git runner of the directory.
 * @returns The remote URL in its Git form, or null.
 */
function selectedRemote(
	git: (...args: string[]) => string | null,
): string | null {
	const names =
		git("remote")
			?.split("\n")
			.map((name) => name.trim())
			.filter((name) => name.length > 0) ?? [];
	const name = names.includes("origin") ? "origin" : names[0];
	return name === undefined ? null : git("remote", "get-url", name);
}
// #endregion FUNC_selectedRemote

// #region FUNC_normalizedRemote
/**
 * @purpose Write one remote URL in the `host/path` form, so a rule glob matches it.
 * @invariants The scheme and the user part are removed.
 * @param remote - The remote URL in its Git form.
 * @returns The normalized remote URL.
 */
function normalizedRemote(remote: string): string {
	return remote
		.replace(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?/i, "")
		.replace(/^[^@/]+@([^:]+):/, "$1/");
}
// #endregion FUNC_normalizedRemote

// #region FUNC_repositoryName
/**
 * @purpose Take the repository name from the common Git directory, so a worktree keeps the main name.
 * @invariants A worktree takes the name of the directory that holds the common Git directory.
 * @invariants The name keeps its case. A directory outside a repository gives null.
 * @param git - The Git runner of the directory.
 * @returns The repository name, or null.
 */
function repositoryName(
	git: (...args: string[]) => string | null,
): string | null {
	const common = git("rev-parse", "--path-format=absolute", "--git-common-dir");
	const root = common === null ? null : git("rev-parse", "--show-toplevel");
	if (common === null || root === null) return null;
	return basename(common) === ".git"
		? basename(dirname(common))
		: basename(root);
}
// #endregion FUNC_repositoryName

/** The active scope key of one directory. */
export function cliActiveScope(base: BaseConfig, cwd: string): ScopeKey {
	return cliScopeResult(base, cwd).key;
}
