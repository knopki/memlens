/**
 * #region moduleContract
 * @modulecontract
 * @purpose Give the three configuration layers one load and merge surface, so the CLI, the plugin,
 * and one preset see the same resolved values.
 * @scope
 *  - The public load of the base, patch, and preset layers, the deep merge, the store path order,
 *    the XDG directories, and the glob match.
 *  - NOT: reading files or the environment, and the rules of the active scope.
 * @invariants
 *  - A later layer wins over an earlier layer: the base, then the patch, then the preset.
 *    A table merges with a table, and a scalar or a list replaces.
 *  - The preset holds no compaction key. The base and the patch select the compaction route.
 *  - The configuration lives in `$XDG_CONFIG_HOME/memlens`. The data lives in `$XDG_DATA_HOME/memlens`.
 * @usecases
 *  - Load: caller => gives TOML text and a default store path => gets the base layer
 *  - Resolve: caller => gives three layers => gets one resolved configuration
 * @dependencies USES API: smol-toml, node:path
 * @rationale
 *  - Q: Why do the readers fill the defaults?
 *    A: Each layer leaves the reader complete, so the merge works on plain spreads.
 * @keywords config, toml, layer, patch, preset, merge, budget
 * #endregion moduleContract
 */

import { join } from "node:path";
import { debuglog } from "node:util";
import { parse as parseToml } from "smol-toml";
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
 * @param text - The content of `config.toml`.
 * @param defaultStorePath - The store path when the file gives none.
 * @returns The validated base layer with the defaults filled.
 */
export function loadBaseConfig(
	text: string,
	defaultStorePath: Path,
): BaseConfig {
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

/** Expand a leading tilde to the home directory of the environment. */
export function expandTilde(
	path: Path,
	env: Record<string, string | undefined>,
): Path {
	const home = env.HOME ?? env.USERPROFILE;
	if (home !== undefined && path === "~") return home;
	if (home !== undefined && path.startsWith("~/"))
		return join(home, path.slice(2));
	return path;
}

/** The config and data directories under the XDG roots of the environment. */
export function xdgDirs(env: Record<string, string | undefined>): {
	configDir: Path;
	dataDir: Path;
} {
	const home = env.HOME ?? env.USERPROFILE;
	const configRoot =
		env.XDG_CONFIG_HOME || (home ? join(home, ".config") : ".config");
	const dataRoot =
		env.XDG_DATA_HOME ||
		(home ? join(home, ".local", "share") : ".local/share");
	return {
		configDir: join(configRoot, "memlens"),
		dataDir: join(dataRoot, "memlens"),
	};
}

// #region FUNC_globMatches
/**
 * @purpose Match one glob, so scope lists, rules, and model globs share one rule.
 * @param glob - The pattern. The part `*` matches any text, and the rest matches itself.
 * @param value - The key or name to test.
 * @returns True when the whole value matches the glob.
 */
export function globMatches(glob: Glob, value: string): boolean {
	const re = new RegExp(`^${glob.split("*").map(escapeRegExp).join(".*")}$`);
	return re.test(value);
}
// #endregion FUNC_globMatches

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
