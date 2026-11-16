/**
 * #region moduleContract
 * @modulecontract
 * @purpose Name each configuration layer and its default values, so the readers and the merge share one shape.
 * @scope The layer types, the rule types, the resolved shape, and the default texts and periods.
 *  NOT: reading a layer and merging the layers.
 * @invariants The review period is a count of days for each note kind.
 * @invariants The cache TTL is a duration for each model glob.
 * @dependencies types/primitives.ts, types/tree.ts.
 * @keywords config, type, layer, rule, budget, cacheTtl, review, nudge, defaults
 * #endregion moduleContract
 */

import type { NoteKind, ScopeKey } from "../types/primitives.js";
import type { Lines } from "../types/tree.js";

/** A count of days. */
export type Days = number;

/** A path on the machine. A leading tilde is the home directory. */
export type Path = string;

/** A duration with a unit, for example `120s`, `5m`, or `2h`. */
export type Duration = `${number}${"s" | "m" | "h"}`;

/** A glob over the whole key. The part `*` matches any text. */
export type Glob = string;

/** The memory that a subagent gets. */
export type SubagentMode = "propose" | "read" | "off";

/** The shape of a run of the compaction. */
export type CompactionMode = "parallel" | "batch" | "auto";

export interface StoreConfig {
	path: Path;

	/** The time without an event that starts the background compaction, in seconds. */
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

export interface CompactionConfig {
	provider: string;
	model: string;
	effort: string;
	mode: CompactionMode;
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
	compaction: CompactionConfig;
	review: ReviewConfig;
}

/** The row `memlens` of `cordis.patch.yml`. */
export interface PatchConfig {
	store?: Partial<StoreConfig>;
	defaultProfile?: string;
	budget?: Partial<Budget>;
	compaction?: Partial<CompactionConfig>;
	nudge?: Partial<NudgeConfig>;
	cacheTtl?: CacheTtl;
	customPrompt?: string;
	customPromptAppend?: string;
}

/**
 * The agent preset. An absent `profile` selects the default profile of the base layer.
 * The preset holds no compaction section.
 */
export interface PresetConfig {
	profile?: string;
	budget?: Partial<Budget>;
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

/** The default budget of a profile that states no complete budget. */
export const DEFAULT_BUDGET: Budget = { here: 20, directions: 10 };

/** The default compaction route and limits of a base file that states none. */
export const DEFAULT_COMPACTION: CompactionConfig = {
	provider: "deepseek",
	model: "deepseek-chat",
	effort: "off",
	mode: "auto",
	batch: 6,
	maxCallsPerHour: 120,
};

/** The default scope rules of a base file that states no `[scope_default]` section. */
export const DEFAULT_SCOPE_DEFAULT: ScopeDefault = {
	rules: [],
	default: "project:misc",
};

/** The default cache TTL of any model. */
export const DEFAULT_TTL: Duration = "1h";

/** The fallback base file for a machine without a configuration file. */
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
default = "project:misc"
`;

/** The default cache TTL map. */
export const DEFAULT_CACHE_TTL: CacheTtl = {
	"deepseek/*": "2h",
	"anthropic/*": "5m",
	"*": DEFAULT_TTL,
};
