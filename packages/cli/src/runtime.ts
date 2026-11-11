/**
 * CLI runtime: configuration load and store access.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give each CLI command one opened store and one resolved configuration, so no command
 * reads files or the environment itself.
 * @scope
 *  - The base TOML load with a built-in fallback, the CLI store path order, the backend choice,
 *    the profile scopes of the store, target resolution, and the visible scope list.
 *  - NOT: command semantics, argument parsing, output formats, and the harness patch.
 * @invariants
 *  - The store path order is --store, then MEMLENS_STORE, then the base file.
 *  - A missing base file falls back to a built-in default configuration with 20 here lines, 10
 *    directions lines, and the sqlite backend, and the CLI writes no file.
 *  - The store opens a second time with the profile scopes of the configuration, so a write plans
 *    invalidations for the catalog of each profile.
 *  - A target with a scope outside the visible scopes of the profile gives NotAllowed.
 *  - A target with no scope in the address and no --scope flag gives a Usage error.
 *  - An address that names no record gives a Data error.
 * @usecases
 *  - Open: command => gives --store and a profile name => gets one runtime and closes it
 *  - Target: command => gives target text and --scope => gets one record with its scope
 * @dependencies USES API: @memlens/core; READS: config.toml, the store directory
 * @keywords runtime, config, store, open, profiles, target, visible, cli
 * #endregion moduleContract
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { debuglog } from "node:util";
import type {
	BaseConfig,
	Projection,
	ProjectionRecord,
	ResolvedConfig,
	ScopeKey,
	StoreConfig,
	StorePort,
} from "@memlens/core";
import {
	activeScope,
	expandTilde,
	globMatches,
	isCatalogKey,
	JsonlStore,
	loadBaseConfig,
	MemlensError,
	normalizeScopeKey,
	parseAddress,
	resolveConfig,
	SqliteStore,
	storePath,
	visibleScopes,
	xdgDirs,
} from "@memlens/core";

const debug = debuglog("memlens:runtime");

/** The fallback configuration for a machine with no base file. */
export const DEFAULT_CONFIG_TOML = `language = "en"
defaultProfile = "default"

[store]
backend = "sqlite"
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

/** One opened CLI runtime: the configuration, the store, and the first projection. */
export interface Runtime {
	readonly base: BaseConfig;
	readonly config: ResolvedConfig;
	/** The resolved store directory. */
	readonly path: string;
	readonly store: StorePort;
	readonly projection: Projection;
	/** The visible scopes of each profile, for a dry-run that plans an import. */
	readonly profiles: ReadonlyMap<string, readonly ScopeKey[]>;
	/** Close the store. Each command calls this before it returns. */
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
 * @invariants The profile name comes from the caller and must exist in the base layer. The store
 * reopens with the resolved profile scopes before the runtime returns.
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
	const store = openBackend(config, path, new Map());
	const first = await store.projection();
	const scopes = profileScopes(base, first);
	await store.close();
	debug("Runtime reopens", {
		event: "reopen",
		path,
		profiles: scopes.size,
	});
	const final = openBackend(config, path, scopes);
	const projection = await final.projection();
	return {
		base,
		config,
		path,
		store: final,
		projection,
		profiles: scopes,
		close: () => final.close(),
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
	return visibleScopes(
		runtime.config.profile.scopes,
		runtime.projection.scopeOrder,
	);
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

// #region FUNC_resolveTarget
/**
 * Resolve one target address into one record.
 *
 * @purpose Map target text and --scope to one record, so each target command shares one rule.
 * @invariants A range target is a Usage error. A scope outside the profile gives NotAllowed.
 */
export function resolveTarget(
	projection: Projection,
	visible: readonly ScopeKey[],
	raw: string,
	scopeFlag: string | null,
): { readonly scope: ScopeKey; readonly record: ProjectionRecord } {
	const address = parseAddress(raw);
	if (address === null)
		throw new MemlensError("Usage", `The target ${raw} is not an address.`);
	if (address.kind === "range" || address.kind === "scoped-range")
		throw new MemlensError("Usage", `The target ${raw} must name one record.`);
	const rawScope = address.scope ?? scopeFlag ?? "";
	if (rawScope === "")
		throw new MemlensError(
			"Usage",
			"The target needs a scope in the address or in --scope.",
		);
	const scope = normalizeScopeKey(rawScope) as ScopeKey;
	if (!visible.includes(scope))
		throw new MemlensError("NotAllowed", `The scope ${scope} is not visible.`);
	const record = (projection.byScope.get(scope) ?? []).find(
		(candidate) => candidate.pos === address.pos,
	);
	if (record === undefined)
		throw new MemlensError(
			"Data",
			`No record of ${scope} is at ${address.pos}.`,
		);
	debug("Target resolved", { event: "target", scope, pos: address.pos });
	return { scope, record };
}
// #endregion FUNC_resolveTarget

/** The active scope key of one directory from the rules of the base layer. */
export function cliActiveScope(base: BaseConfig, cwd: string): ScopeKey {
	return activeScope(base.scope_default, { path: cwd }).key;
}

function openBackend(
	config: ResolvedConfig,
	path: string,
	scopes: ReadonlyMap<string, readonly ScopeKey[]>,
): StorePort {
	const open = (store: StoreConfig) =>
		store.backend === "jsonl"
			? new JsonlStore(path, scopes, config.language)
			: new SqliteStore(path, scopes, config.language);
	const store = open(config.store);
	debug("Store opened", {
		event: "open",
		backend: config.store.backend,
		profiles: scopes.size,
	});
	return store;
}

/** Resolve the visible scopes of each profile of the base layer against the known scopes. */
function profileScopes(
	base: BaseConfig,
	projection: Projection,
): ReadonlyMap<string, readonly ScopeKey[]> {
	return new Map(
		Object.entries(base.profile).map(([name, profile]) => [
			name,
			visibleScopes(profile.scopes, projection.scopeOrder),
		]),
	);
}
