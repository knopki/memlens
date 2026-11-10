/**
 * Configuration layers: load, validate, and merge.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give the three configuration layers one load and merge surface, so the CLI, the plugin,
 * and one preset see the same resolved values.
 * @scope
 *  - Layer types, strict shape checks, the deep merge with defaults, the store path order, and the
 *    cache TTL lookup.
 *  - NOT: reading files or the environment, and the rules of the active scope.
 * @invariants
 *  - A key outside the layer type is an error at load.
 *  - A scope key outside the two-segment shape is an error at load. The placeholder `{repo}` is the
 *    one exception, and only in a rule key of `git_remote`.
 *  - The base file is TOML. The patch and the preset arrive as parsed objects.
 *  - The merge is deep: a table merges with a table, and a scalar or a list replaces.
 *  - A later layer wins over an earlier layer. The order is base, patch, preset.
 *  - A preset without `profile` is an error at load.
 *  - A profile name that the base file does not list is an error at resolve.
 *  - Defaults at load: language `en`, store idle 300 seconds, store path from the caller, subagents
 *    `propose`, writer mode `auto`, writer effort `off`, writer batch 6, 120 calls an hour, nudge
 *    counters 10 and 10, nudge texts with `{n}`, review 365 days for `decision`, `preference`, and
 *    `note`, 180 days for `fact`, and 7 days for `task`.
 *  - The store path order is `--store`, then `MEMLENS_STORE`, then the base file.
 *  - The cache TTL lookup takes the most specific matching glob. The glob `*` matches any text.
 * @usecases
 *  - Load: caller => gives TOML text and a default store path => gets the base layer
 *  - Resolve: caller => gives three layers => gets one resolved configuration
 * @dependencies USES API: smol-toml, node:path
 * @rationale
 *  - Q: Why do the readers fill the defaults?
 *    A: Each layer leaves the reader complete, so the merge works on plain spreads.
 * @keywords config, toml, layer, patch, preset, merge, budget, cacheTtl, duration
 * #endregion moduleContract
 */

import { join } from "node:path";
import { debuglog } from "node:util";
import { parse as parseToml } from "smol-toml";
import { MemlensError } from "../types/errors.js";
import type { NoteKind, ScopeKey } from "../types/events.js";
import { validateScopeKey } from "./scope.js";

const debug = debuglog("memlens:config");

/** A count of lines of the slice. */
export type Lines = number;

/** A count of days. */
export type Days = number;

/** A path on the machine. A leading tilde is the home directory. */
export type Path = string;

/** A duration with a unit, for example `120s`, `5m`, or `2h`. */
export type Duration = `${number}${"s" | "m" | "h"}`;

/** A glob over the whole key. The part `*` matches any text. */
export type Glob = string;

/** The backend of the store. */
export type StoreBackend = "sqlite" | "jsonl";

/** The memory that a subagent gets. */
export type SubagentMode = "propose" | "read" | "off";

/** The shape of a run of the writer. */
export type WriterMode = "parallel" | "batch" | "auto";

export interface StoreConfig {
	backend: StoreBackend;
	path: Path;
	/** The time without an event that starts the background writer, in seconds. */
	idle: number;
}

export interface Budget {
	/** The maximum count of lines of the tree of the active scope. */
	here: Lines;
	/** The maximum count of lines of the tree of the catalog. */
	directions: Lines;
}

export interface ProfileConfig {
	/** The scopes that the profile sees. A key is a glob. */
	scopes: Glob[];
	budget: Budget;
	subagents?: SubagentMode;
}

export interface RuleGitRemote {
	match: "git_remote";
	glob: Glob;
	/** The key of the active scope. `{repo}` takes the repository name of the remote. */
	key: ScopeKey;
}

export interface RulePath {
	match: "path";
	glob: Glob;
	key: ScopeKey;
}

export interface RuleWorkspace {
	match: "workspace";
	id: string;
	key: ScopeKey;
}

/** One rule of the active scope. */
export type Rule = RuleGitRemote | RulePath | RuleWorkspace;

export interface ScopeDefault {
	rules: Rule[];
	/** The key when no rule matches. */
	default: ScopeKey;
}

export interface NudgeConfig {
	/** The counters run at the same time. */
	tool_calls: number;
	turns: number;
	/** The line of each counter. `{n}` takes the count of that counter. */
	text: Record<"tool_calls" | "turns", string>;
}

export interface WriterConfig {
	provider: string;
	model: string;
	effort: string;
	mode: WriterMode;
	batch: number;
	maxCallsPerHour: number;
}

/** The review period of each kind of a note, in days. */
export type ReviewConfig = Record<NoteKind, Days>;

/** The idle time of one model glob. The most specific glob wins. */
export type CacheTtl = Record<Glob, Duration>;

/** The base file, `$XDG_CONFIG_HOME/memlens/config.toml`. */
export interface BaseConfig {
	/** One value for the store. It selects the tokenizer of the index. */
	language: string;
	defaultProfile: string;
	store: StoreConfig;
	profile: Record<string, ProfileConfig>;
	scope_default: ScopeDefault;
	nudge: NudgeConfig;
	writer: WriterConfig;
	review: ReviewConfig;
}

/** The row `memlens` of `cordis.patch.yml`. */
export interface PatchConfig {
	store?: Partial<StoreConfig>;
	defaultProfile?: string;
	budget?: Partial<Budget>;
	writer?: Partial<WriterConfig>;
	nudge?: Partial<NudgeConfig>;
	cacheTtl?: CacheTtl;
	customPrompt?: string;
	customPromptAppend?: string;
}

/** The agent preset. `profile` is the only required key. */
export interface PresetConfig {
	profile: string;
	budget?: Partial<Budget>;
	writer?: Partial<WriterConfig>;
	nudge?: Partial<NudgeConfig>;
	customPrompt?: string;
	customPromptAppend?: string;
}

/** The configuration that the code uses, after the merge and the defaults. */
export interface ResolvedConfig extends Omit<BaseConfig, "profile"> {
	profile: ProfileConfig;
	budget: Budget;
	cacheTtl: CacheTtl;
	customPrompt: string | null;
	customPromptAppend: string | null;
}

/** The default texts of the nudge counters. */
export const NUDGE_TEXTS: Record<"tool_calls" | "turns", string> = {
	tool_calls:
		"[memory] {n} tool calls since the last record. Anything durable: a decision, a correction, a preference, a failed attempt and its cause?",
	turns:
		"[memory] {n} turns since the last record. Anything durable: a decision, a correction, a preference, a failed attempt and its cause?",
};

/** The default review period of each kind, in days. */
export const DEFAULT_REVIEW_DAYS: ReviewConfig = {
	decision: 365,
	preference: 365,
	fact: 180,
	task: 7,
	note: 365,
};

/** The default cache TTL of any model. */
const DEFAULT_TTL: Duration = "1h";

/** The default cache TTL map. */
export const DEFAULT_CACHE_TTL: CacheTtl = {
	"deepseek/*": "2h",
	"anthropic/*": "5m",
	"*": DEFAULT_TTL,
};

const DURATION_RE = /^\d+[smh]$/;
const SCOPE_KINDS: readonly NoteKind[] = [
	"decision",
	"preference",
	"fact",
	"task",
	"note",
];

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
			"writer",
			"review",
		],
		"config",
	);

	const storeRec = expectRecord(root.store, "store");
	expectKeys(storeRec, ["backend", "path", "idle"], "store");
	const backend = expectOneOf(
		storeRec.backend,
		["sqlite", "jsonl"],
		"store.backend",
	);
	const store: StoreConfig = {
		backend,
		path:
			storeRec.path === undefined
				? defaultStorePath
				: expectString(storeRec.path, "store.path"),
		idle:
			storeRec.idle === undefined
				? 300
				: expectCount(storeRec.idle, "store.idle"),
	};

	const profiles = expectRecord(root.profile, "profile");
	if (Object.keys(profiles).length === 0) {
		throw new MemlensError("Data", "config.profile holds no profile");
	}
	const profile: Record<string, ProfileConfig> = {};
	for (const [name, value] of Object.entries(profiles)) {
		profile[name] = readProfile(value, `profile.${name}`);
	}

	const result: BaseConfig = {
		language:
			root.language === undefined
				? "en"
				: expectString(root.language, "language"),
		defaultProfile: expectString(root.defaultProfile, "defaultProfile"),
		store,
		profile,
		scope_default: readScopeDefault(root.scope_default),
		nudge: readNudge(root.nudge),
		writer: readWriter(root.writer),
		review: readReview(root.review),
	};
	debug("Base config loaded", {
		event: "base",
		profiles: Object.keys(profile).length,
		backend: store.backend,
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
	const row = expectRecord(value, "patch");
	expectKeys(
		row,
		[
			"store",
			"defaultProfile",
			"budget",
			"writer",
			"nudge",
			"cacheTtl",
			"customPrompt",
			"customPromptAppend",
		],
		"patch",
	);
	const patch: PatchConfig = {};
	if (row.store !== undefined) {
		const storeRec = expectRecord(row.store, "patch.store");
		expectKeys(storeRec, ["backend", "path", "idle"], "patch.store");
		const store: Partial<StoreConfig> = {};
		if (storeRec.backend !== undefined) {
			store.backend = expectOneOf(
				storeRec.backend,
				["sqlite", "jsonl"],
				"patch.store.backend",
			);
		}
		if (storeRec.path !== undefined)
			store.path = expectString(storeRec.path, "patch.store.path");
		if (storeRec.idle !== undefined)
			store.idle = expectCount(storeRec.idle, "patch.store.idle");
		patch.store = store;
	}
	if (row.defaultProfile !== undefined)
		patch.defaultProfile = expectString(
			row.defaultProfile,
			"patch.defaultProfile",
		);
	if (row.budget !== undefined)
		patch.budget = readBudget(row.budget, "patch.budget");
	if (row.writer !== undefined)
		patch.writer = readPartialWriter(row.writer, "patch.writer");
	if (row.nudge !== undefined)
		patch.nudge = readPartialNudge(row.nudge, "patch.nudge");
	if (row.cacheTtl !== undefined) patch.cacheTtl = readCacheTtl(row.cacheTtl);
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
 * @param value - The parsed preset object.
 * @returns The validated preset layer.
 */
export function loadPresetConfig(value: unknown): PresetConfig {
	const row = expectRecord(value, "preset");
	expectKeys(
		row,
		[
			"profile",
			"budget",
			"writer",
			"nudge",
			"customPrompt",
			"customPromptAppend",
		],
		"preset",
	);
	if (row.profile === undefined) {
		throw new MemlensError("Data", "preset.profile is absent");
	}
	const preset: PresetConfig = {
		profile: expectString(row.profile, "preset.profile"),
	};
	if (row.budget !== undefined)
		preset.budget = readBudget(row.budget, "preset.budget");
	if (row.writer !== undefined)
		preset.writer = readPartialWriter(row.writer, "preset.writer");
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
	const name = preset?.profile ?? patch.defaultProfile ?? base.defaultProfile;
	const named = base.profile[name];
	if (named === undefined) {
		throw new MemlensError("Data", `config.profile holds no profile ${name}`);
	}
	const budget: Budget = {
		...named.budget,
		...(patch.budget ?? {}),
		...(preset?.budget ?? {}),
	};
	const profile: ProfileConfig = {
		scopes: named.scopes,
		budget,
		subagents: named.subagents ?? "propose",
	};
	const result: ResolvedConfig = {
		language: base.language,
		defaultProfile: name,
		store: { ...base.store, ...(patch.store ?? {}) },
		profile,
		budget,
		scope_default: base.scope_default,
		nudge: { ...base.nudge, ...(patch.nudge ?? {}), ...(preset?.nudge ?? {}) },
		writer: {
			...base.writer,
			...(patch.writer ?? {}),
			...(preset?.writer ?? {}),
		},
		review: base.review,
		cacheTtl: { ...DEFAULT_CACHE_TTL, ...(patch.cacheTtl ?? {}) },
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

/** Parse a duration into seconds. */
export function parseDuration(value: string): number {
	if (!DURATION_RE.test(value)) {
		throw new MemlensError("Data", `duration ${value} is not <number><s|m|h>`);
	}
	const n = Number(value.slice(0, -1));
	const unit = value.at(-1);
	return n * (unit === "h" ? 3600 : unit === "m" ? 60 : 1);
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

// #region FUNC_ttlSeconds
/**
 * @purpose Give the cache TTL of one model in seconds, so the plugin knows when a new text is due.
 * @param cacheTtl - The glob to duration map.
 * @param model - The model name, for example `deepseek/deepseek-chat`.
 * @returns The seconds of the most specific matching glob. The built-in `*` entry matches any name.
 */
export function ttlSeconds(cacheTtl: CacheTtl, model: string): number {
	let best: { glob: string; literal: number } | null = null;
	for (const glob of Object.keys(cacheTtl)) {
		if (!globMatches(glob, model)) continue;
		const literal = glob.length - countStars(glob);
		if (
			best === null ||
			literal > best.literal ||
			(literal === best.literal && glob.length < best.glob.length)
		) {
			best = { glob, literal };
		}
	}
	const chosen = best?.glob ?? "*";
	const raw = cacheTtl[chosen] ?? DEFAULT_TTL;
	debug("Cache TTL picked", {
		event: "ttl",
		model,
		seconds: parseDuration(raw),
		glob: chosen,
	});
	return parseDuration(raw);
}
// #endregion FUNC_ttlSeconds

function countStars(glob: string): number {
	let n = 0;
	for (const ch of glob) if (ch === "*") n++;
	return n;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectRecord(value: unknown, where: string): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new MemlensError("Data", `${where} is not a table`);
	}
	return value as Record<string, unknown>;
}

function expectKeys(
	record: Record<string, unknown>,
	allowed: readonly string[],
	where: string,
): void {
	for (const key of Object.keys(record)) {
		if (!allowed.includes(key)) {
			throw new MemlensError("Data", `${where} holds the unknown key ${key}`);
		}
	}
}

function expectString(value: unknown, where: string): string {
	if (typeof value !== "string") {
		throw new MemlensError("Data", `${where} is not a string`);
	}
	return value;
}

function expectCount(value: unknown, where: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
		throw new MemlensError("Data", `${where} is not a whole number above 0`);
	}
	return value;
}

function expectOneOf<T extends string>(
	value: unknown,
	allowed: readonly T[],
	where: string,
): T {
	const text = expectString(value, where);
	if (!(allowed as readonly string[]).includes(text)) {
		throw new MemlensError(
			"Data",
			`${where} is not one of ${allowed.join(", ")}`,
		);
	}
	return text as T;
}

function expectScopeKey(
	value: unknown,
	where: string,
	allowRepo: boolean,
): ScopeKey {
	const key = expectString(value, where);
	const probe = allowRepo ? key.replaceAll("{repo}", "x") : key;
	if (!validateScopeKey(probe)) {
		throw new MemlensError("Data", `${where} is not a scope key: ${key}`);
	}
	return key as ScopeKey;
}

function readProfile(value: unknown, where: string): ProfileConfig {
	const record = expectRecord(value, where);
	expectKeys(record, ["scopes", "budget", "subagents"], where);
	if (record.scopes === undefined) {
		throw new MemlensError("Data", `${where}.scopes is absent`);
	}
	if (
		!Array.isArray(record.scopes) ||
		record.scopes.some((glob) => typeof glob !== "string")
	) {
		throw new MemlensError("Data", `${where}.scopes is not a list of globs`);
	}
	const profile: ProfileConfig = {
		scopes: record.scopes as Glob[],
		budget: readFullBudget(record.budget, `${where}.budget`),
	};
	if (record.subagents !== undefined) {
		profile.subagents = expectOneOf(
			record.subagents,
			["propose", "read", "off"],
			`${where}.subagents`,
		);
	}
	return profile;
}

function readFullBudget(value: unknown, where: string): Budget {
	const partial = readBudget(value, where);
	if (partial.here === undefined || partial.directions === undefined) {
		throw new MemlensError("Data", `${where} needs here and directions`);
	}
	return { here: partial.here, directions: partial.directions };
}

function readBudget(value: unknown, where: string): Partial<Budget> {
	const record = expectRecord(value, where);
	expectKeys(record, ["here", "directions"], where);
	const budget: Partial<Budget> = {};
	if (record.here !== undefined)
		budget.here = expectCount(record.here, `${where}.here`);
	if (record.directions !== undefined)
		budget.directions = expectCount(record.directions, `${where}.directions`);
	return budget;
}

function readScopeDefault(value: unknown): ScopeDefault {
	const where = "scope_default";
	const record = expectRecord(value, where);
	expectKeys(record, ["rules", "default"], where);
	if (record.rules !== undefined && !Array.isArray(record.rules)) {
		throw new MemlensError("Data", `${where}.rules is not a list`);
	}
	const rules = (record.rules ?? []).map((rule: unknown, index: number) =>
		readRule(rule, index),
	);
	return {
		rules,
		default: expectScopeKey(record.default, `${where}.default`, false),
	};
}

function readRule(value: unknown, index: number): Rule {
	const where = `scope_default.rules[${index}]`;
	const record = expectRecord(value, where);
	if (record.match === undefined) {
		throw new MemlensError("Data", `${where}.match is absent`);
	}
	const match = expectOneOf(
		record.match,
		["git_remote", "path", "workspace"],
		`${where}.match`,
	);
	if (match === "workspace") {
		expectKeys(record, ["match", "id", "key"], where);
		return {
			match,
			id: expectString(record.id, `${where}.id`),
			key: expectScopeKey(record.key, `${where}.key`, false),
		};
	}
	expectKeys(record, ["match", "glob", "key"], where);
	return {
		match,
		glob: expectString(record.glob, `${where}.glob`),
		key: expectScopeKey(record.key, `${where}.key`, match === "git_remote"),
	};
}

function readNudge(value: unknown): NudgeConfig {
	const partial = value === undefined ? {} : readPartialNudge(value, "nudge");
	return {
		tool_calls: partial.tool_calls ?? 10,
		turns: partial.turns ?? 10,
		text: partial.text ?? { ...NUDGE_TEXTS },
	};
}

function readPartialNudge(value: unknown, where: string): Partial<NudgeConfig> {
	const record = expectRecord(value, where);
	expectKeys(record, ["tool_calls", "turns", "text"], where);
	const partial: Partial<NudgeConfig> = {};
	if (record.tool_calls !== undefined)
		partial.tool_calls = expectCount(record.tool_calls, `${where}.tool_calls`);
	if (record.turns !== undefined)
		partial.turns = expectCount(record.turns, `${where}.turns`);
	if (record.text !== undefined) partial.text = readNudgeText(record.text);
	return partial;
}

function readNudgeText(value: unknown): Record<"tool_calls" | "turns", string> {
	const record = expectRecord(value, "nudge.text");
	expectKeys(record, ["tool_calls", "turns"], "nudge.text");
	const result = {} as Record<"tool_calls" | "turns", string>;
	for (const counter of ["tool_calls", "turns"] as const) {
		const text =
			record[counter] === undefined
				? NUDGE_TEXTS[counter]
				: expectString(record[counter], `nudge.text.${counter}`);
		if (!text.includes("{n}")) {
			throw new MemlensError("Data", `nudge.text.${counter} holds no {n}`);
		}
		result[counter] = text;
	}
	return result;
}

function readWriter(value: unknown): WriterConfig {
	const record = expectRecord(value, "writer");
	expectKeys(
		record,
		["provider", "model", "effort", "mode", "batch", "maxCallsPerHour"],
		"writer",
	);
	return {
		provider: requireString(record.provider, "writer.provider"),
		model: requireString(record.model, "writer.model"),
		effort:
			record.effort === undefined
				? "off"
				: expectString(record.effort, "writer.effort"),
		mode:
			record.mode === undefined
				? "auto"
				: expectOneOf(
						record.mode,
						["parallel", "batch", "auto"],
						"writer.mode",
					),
		batch:
			record.batch === undefined
				? 6
				: expectCount(record.batch, "writer.batch"),
		maxCallsPerHour:
			record.maxCallsPerHour === undefined
				? 120
				: expectCount(record.maxCallsPerHour, "writer.maxCallsPerHour"),
	};
}

function readPartialWriter(
	value: unknown,
	where: string,
): Partial<WriterConfig> {
	const record = expectRecord(value, where);
	expectKeys(
		record,
		["provider", "model", "effort", "mode", "batch", "maxCallsPerHour"],
		where,
	);
	const partial: Partial<WriterConfig> = {};
	if (record.provider !== undefined)
		partial.provider = expectString(record.provider, `${where}.provider`);
	if (record.model !== undefined)
		partial.model = expectString(record.model, `${where}.model`);
	if (record.effort !== undefined)
		partial.effort = expectString(record.effort, `${where}.effort`);
	if (record.mode !== undefined)
		partial.mode = expectOneOf(
			record.mode,
			["parallel", "batch", "auto"],
			`${where}.mode`,
		);
	if (record.batch !== undefined)
		partial.batch = expectCount(record.batch, `${where}.batch`);
	if (record.maxCallsPerHour !== undefined) {
		partial.maxCallsPerHour = expectCount(
			record.maxCallsPerHour,
			`${where}.maxCallsPerHour`,
		);
	}
	return partial;
}

function requireString(value: unknown, where: string): string {
	if (value === undefined) {
		throw new MemlensError("Data", `${where} is absent`);
	}
	return expectString(value, where);
}

function readReview(value: unknown): ReviewConfig {
	if (value === undefined) {
		return { ...DEFAULT_REVIEW_DAYS };
	}
	const record = expectRecord(value, "review");
	expectKeys(record, SCOPE_KINDS, "review");
	const result = { ...DEFAULT_REVIEW_DAYS };
	for (const kind of SCOPE_KINDS) {
		if (record[kind] !== undefined) {
			result[kind] = expectCount(record[kind], `review.${kind}`);
		}
	}
	return result;
}

function readCacheTtl(value: unknown): CacheTtl {
	const record = expectRecord(value, "cacheTtl");
	const result: CacheTtl = {};
	for (const [glob, duration] of Object.entries(record)) {
		const text = expectString(duration, `cacheTtl.${glob}`);
		if (!DURATION_RE.test(text)) {
			throw new MemlensError("Data", `cacheTtl.${glob} is not a duration`);
		}
		result[glob] = text as Duration;
	}
	return result;
}
