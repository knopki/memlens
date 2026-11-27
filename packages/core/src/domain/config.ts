/**
 * #region moduleContract
 * @modulecontract
 * @purpose Give the three configuration layers one load and merge surface, so the CLI, the plugin,
 * and one preset see the same resolved values.
 * @scope
 *  - The public load of the base, patch, and preset layers, the deep merge, the store path order,
 *    the native directories of the platform, and the glob match.
 *  - NOT: reading files or the environment, and the rules of the active scope.
 * @invariants
 *  - A later layer wins over an earlier layer: the base, then the patch, then the preset.
 *    A table merges with a table, and a scalar or a list replaces.
 *  - The preset holds no compaction key. The base and the patch select the compaction route.
 *  - The configuration and the data live in the native directories of the platform. An absolute
 *    XDG root of the environment wins over the native root.
 *  - An absent base file is the default layer, and no parser runs for it.
 * @usecases
 *  - Load: caller => gives the TOML text or an absent file and a default store path => gets the base layer
 *  - Resolve: caller => gives three layers => gets one resolved configuration
 * @dependencies USES API: smol-toml, node:path, node:os
 * @rationale
 *  - Q: Why do the readers fill the defaults?
 *    A: Each layer leaves the reader complete, so the merge works on plain spreads.
 * @keywords config, toml, layer, patch, preset, merge, budget
 * #endregion moduleContract
 */

import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import { debuglog } from "node:util";
import { parse as parseToml } from "smol-toml";
import { MemlensError } from "../types/errors.js";
import {
	expectKeys,
	expectRecord,
	expectString,
	readBudget,
	readCompaction,
	readNudge,
	readPartialCompaction,
	readPartialNudge,
	readPatchStore,
	readProfiles,
	readReview,
	readScopeDefault,
	readStore,
} from "./config-read.js";
import {
	type BaseConfig,
	type Budget,
	DEFAULT_BUDGET,
	type Glob,
	type PatchConfig,
	type Path,
	type PresetConfig,
	type ProfileConfig,
	type ResolvedConfig,
	type StoreConfig,
} from "./config-types.js";

const debug = debuglog("memlens:config");

// #region FUNC_loadBaseConfig
/**
 * @purpose Read the base TOML file into a complete layer, so the rest of the code sees one shape.
 *   An absent file is the default layer, and no parser runs.
 * @param text - The content of `config.toml`, or null when the file is absent.
 * @param defaultStorePath - The store path when the file gives none.
 * @returns The validated base layer with the defaults filled.
 */
export function loadBaseConfig(
	text: string | null,
	defaultStorePath: Path,
): BaseConfig {
	if (text === null) {
		const layer: BaseConfig = {
			language: "en",
			defaultProfile: "default",
			store: readStore(undefined, defaultStorePath),
			profile: readProfiles(undefined),
			scope_default: readScopeDefault(undefined),
			nudge: readNudge(undefined),
			compaction: readCompaction(undefined),
			review: readReview(undefined),
		};
		debug("Base config loaded", { event: "base", absent: true });
		return layer;
	}
	const value = parseToml(text) as unknown;
	const root = expectRecord(value, "config");
	expectKeys(
		root,
		[
			"language",
			"defaultProfile",
			"store",
			"profile",
			"scope_default",
			"nudge",
			"compaction",
			"review",
		],
		"config",
	);

	const store = readStore(root.store, defaultStorePath);
	const profile = readProfiles(root.profile);

	const result: BaseConfig = {
		language:
			root.language === undefined
				? "en"
				: expectString(root.language, "language"),
		defaultProfile:
			root.defaultProfile === undefined
				? "default"
				: expectString(root.defaultProfile, "defaultProfile"),
		store,
		profile,
		scope_default: readScopeDefault(root.scope_default),
		nudge: readNudge(root.nudge),
		compaction: readCompaction(root.compaction),
		review: readReview(root.review),
	};
	debug("Base config loaded", {
		event: "base",
		profiles: Object.keys(profile).length,
		defaultProfile: result.defaultProfile,
	});
	return result;
}
// #endregion FUNC_loadBaseConfig

// #region FUNC_loadPatchConfig
/**
 * @purpose Read the patch row of the harness into a layer, so the harness profile can override values.
 * @param value - The parsed row `memlens` of `cordis.patch.yml`.
 * @returns The validated patch layer. Each key is optional.
 */
export function loadPatchConfig(value: unknown): PatchConfig {
	if (value === undefined) return {};
	const row = expectRecord(value, "patch");
	expectKeys(
		row,
		[
			"store",
			"defaultProfile",
			"budget",
			"compaction",
			"nudge",
			"customPrompt",
			"customPromptAppend",
		],
		"patch",
	);
	const patch: PatchConfig = {};
	if (row.store !== undefined) patch.store = readPatchStore(row.store);
	if (row.defaultProfile !== undefined)
		patch.defaultProfile = expectString(
			row.defaultProfile,
			"patch.defaultProfile",
		);
	if (row.budget !== undefined)
		patch.budget = readBudget(row.budget, "patch.budget");
	if (row.compaction !== undefined)
		patch.compaction = readPartialCompaction(
			row.compaction,
			"patch.compaction",
		);
	if (row.nudge !== undefined)
		patch.nudge = readPartialNudge(row.nudge, "patch.nudge");
	if (row.customPrompt !== undefined)
		patch.customPrompt = expectString(row.customPrompt, "patch.customPrompt");
	if (row.customPromptAppend !== undefined) {
		patch.customPromptAppend = expectString(
			row.customPromptAppend,
			"patch.customPromptAppend",
		);
	}
	debug("Patch config loaded", { event: "patch", keys: Object.keys(patch) });
	return patch;
}
// #endregion FUNC_loadPatchConfig

// #region FUNC_loadPresetConfig
/**
 * @purpose Read an agent preset into a layer, so one agent can override values of its profile.
 * @invariants An absent `profile` gives no key, so the merge selects the default profile.
 * @invariants A preset cannot override the compaction route.
 * @param value - The parsed preset object. An absent value gives the empty layer.
 * @returns The validated preset layer.
 */
export function loadPresetConfig(value: unknown): PresetConfig {
	if (value === undefined) return {};
	const row = expectRecord(value, "preset");
	expectKeys(
		row,
		["profile", "budget", "nudge", "customPrompt", "customPromptAppend"],
		"preset",
	);
	const preset: PresetConfig = {};
	if (row.profile !== undefined) {
		preset.profile = expectString(row.profile, "preset.profile");
	}
	if (row.budget !== undefined)
		preset.budget = readBudget(row.budget, "preset.budget");
	if (row.nudge !== undefined)
		preset.nudge = readPartialNudge(row.nudge, "preset.nudge");
	if (row.customPrompt !== undefined)
		preset.customPrompt = expectString(row.customPrompt, "preset.customPrompt");
	if (row.customPromptAppend !== undefined) {
		preset.customPromptAppend = expectString(
			row.customPromptAppend,
			"preset.customPromptAppend",
		);
	}
	debug("Preset config loaded", { event: "preset", profile: preset.profile });
	return preset;
}
// #endregion FUNC_loadPresetConfig

// #region FUNC_resolveConfig
/**
 * @purpose Merge the three layers into one resolved configuration, so each caller reads one object.
 * @ensures A profile name that the base file does not list resolves to the default profile values.
 * @param base - The base layer.
 * @param patch - The patch layer. Give an empty object when no patch exists.
 * @param preset - The preset layer, or null.
 * @returns The resolved configuration. `defaultProfile` holds the effective profile name.
 */
export function resolveConfig(
	base: BaseConfig,
	patch: PatchConfig,
	preset: PresetConfig | null,
): ResolvedConfig {
	const name =
		preset?.profile || patch.defaultProfile || base.defaultProfile || "default";
	const named = base.profile[name];
	if (named === undefined) {
		debug("Profile absent; the default profile values apply", {
			event: "resolve-profile-default",
			profile: name,
		});
	}
	const values = named ?? {
		scopes: ["*"] as Glob[],
		budget: { ...DEFAULT_BUDGET },
		subagents: "propose" as const,
	};
	const budget: Budget = {
		...values.budget,
		...(patch.budget ?? {}),
		...(preset?.budget ?? {}),
	};
	const profile: ProfileConfig = {
		scopes: values.scopes,
		budget,
		subagents: values.subagents ?? "propose",
	};
	const result: ResolvedConfig = {
		language: base.language,
		defaultProfile: name,
		store: { ...base.store, ...(patch.store ?? {}) },
		profile,
		budget,
		scope_default: base.scope_default,
		nudge: { ...base.nudge, ...(patch.nudge ?? {}), ...(preset?.nudge ?? {}) },
		compaction: { ...base.compaction, ...(patch.compaction ?? {}) },
		review: base.review,
		customPrompt: preset?.customPrompt ?? patch.customPrompt ?? null,
		customPromptAppend:
			preset?.customPromptAppend ?? patch.customPromptAppend ?? null,
	};
	debug("Config resolved", {
		event: "resolve",
		profile: name,
		here: budget.here,
		directions: budget.directions,
	});
	return result;
}
// #endregion FUNC_resolveConfig

// #region FUNC_profileNames
/**
 * @purpose List the profile names that a console offers, so the switcher always holds one name.
 * @invariants The list follows the base file order. The list ends with the fallback name when the
 *   base file does not name it.
 * @param base - The base layer.
 * @param fallback - The effective profile name of the session.
 * @returns The offered profile names. The list holds at least the fallback name.
 */
export function profileNames(base: BaseConfig, fallback: string): string[] {
	const names = Object.keys(base.profile);
	debug("Profile names listed", {
		event: "profile-names",
		named: names.length,
		fallback,
	});
	return names.includes(fallback) ? names : [...names, fallback];
}
// #endregion FUNC_profileNames

// #region FUNC_storePath
/**
 * @purpose Pick the store path by the fixed order, so each frontend opens the same directory.
 * @param flag - The value of `--store`, or null.
 * @param env - The value of `MEMLENS_STORE`, or null.
 * @param base - The store section of the base layer.
 * @returns The store path: the flag first, then the environment, then the file.
 */
export function storePath(
	flag: Path | null,
	env: Path | null,
	base: StoreConfig,
): Path {
	const picked = flag ?? env ?? base.path;
	debug("Store path picked", {
		event: "store-path",
		path: picked,
		source: flag !== null ? "flag" : env !== null ? "env" : "config",
	});
	return picked;
}
// #endregion FUNC_storePath

// #region FUNC_expandTilde
/**
 * @purpose Expand a leading `~/` or `~\` to the home directory, with the separator of the platform.
 * @invariants An unknown home directory raises an error, and no relative path leaves the call.
 */
export function expandTilde(
	path: Path,
	env: Record<string, string | undefined>,
	platform: NodeJS.Platform = process.platform,
): Path {
	const tilde = path === "~" || path.startsWith("~/") || path.startsWith("~\\");
	if (!tilde) return path;
	const home = homeDir(env, platform);
	const rest = path.slice(2);
	return path === "~" || rest.length === 0
		? home
		: pathRules(platform).join(home, rest);
}
// #endregion FUNC_expandTilde

// #region FUNC_nativeDirs
/**
 * @purpose Give the configuration and the data directory of the platform.
 * @invariants An absolute XDG root of the environment wins over the native root. The result holds
 *   absolute paths, so no store opens under the working directory.
 */
export function nativeDirs(
	env: Record<string, string | undefined>,
	platform: NodeJS.Platform = process.platform,
): { configDir: Path; dataDir: Path } {
	const roots = nativeRoots(env, platform);
	const tool = pathRules(platform);
	debug("Native roots resolved", {
		event: "dirs",
		platform,
		configRoot: roots.config,
		dataRoot: roots.data,
	});
	return {
		configDir: tool.join(roots.config, "memlens"),
		dataDir: tool.join(roots.data, "memlens"),
	};
}
// #endregion FUNC_nativeDirs

/** The root of each directory, before the name `memlens`. */
function nativeRoots(
	env: Record<string, string | undefined>,
	platform: NodeJS.Platform,
): { config: Path; data: Path } {
	const tool = pathRules(platform);
	const xdg = (value: string | undefined): Path | null =>
		value !== undefined && tool.isAbsolute(value) ? value : null;
	const home = (...segments: string[]): Path =>
		tool.join(homeDir(env, platform), ...segments);
	const xdgConfig = xdg(env.XDG_CONFIG_HOME);
	const xdgData = xdg(env.XDG_DATA_HOME);
	if (platform === "win32") {
		return {
			config: xdgConfig ?? xdg(env.APPDATA) ?? home("AppData", "Roaming"),
			data: xdgData ?? xdg(env.LOCALAPPDATA) ?? home("AppData", "Local"),
		};
	}
	if (platform === "darwin") {
		const support = home("Library", "Application Support");
		return { config: xdgConfig ?? support, data: xdgData ?? support };
	}
	return {
		config: xdgConfig ?? home(".config"),
		data: xdgData ?? home(".local", "share"),
	};
}

/**
 * The home directory. A relative value is ignored. Windows reads `USERPROFILE` first, because a
 * shell sets `HOME` to a POSIX path.
 */
function homeDir(
	env: Record<string, string | undefined>,
	platform: NodeJS.Platform,
): Path {
	const tool = pathRules(platform);
	const named =
		(platform === "win32"
			? env.USERPROFILE || env.HOME
			: env.HOME || env.USERPROFILE) || null;
	const home = named !== null && tool.isAbsolute(named) ? named : homedir();
	if (home.length === 0) {
		throw new MemlensError(
			"Data",
			"The home directory is unknown, so memlens has no path for its files.",
		);
	}
	return home;
}

/** The path rules of one platform, so a branch of another system runs in a test on any host. */
function pathRules(platform: NodeJS.Platform): typeof posix {
	return platform === "win32" ? win32 : posix;
}

const globPatterns = new Map<string, RegExp>();

// #region FUNC_globMatches
/**
 * @purpose Match one glob, so scope lists, rules, and model globs share one rule.
 * @param glob - The pattern. The part `*` matches any text, and the rest matches itself.
 * @param value - The key or name to test.
 * @returns True when the whole value matches the glob.
 * @invariant One glob text compiles at most once, because scope lists compare it with every scope.
 */
export function globMatches(glob: Glob, value: string): boolean {
	let re = globPatterns.get(glob);
	if (re === undefined) {
		re = new RegExp(`^${glob.split("*").map(escapeRegExp).join(".*")}$`);
		globPatterns.set(glob, re);
	}
	return re.test(value);
}
// #endregion FUNC_globMatches

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
