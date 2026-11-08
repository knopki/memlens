/**
 * The configuration of memlens.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Give the base file, the profile patch, and the agent preset one type surface, so a key
 * and its value have one home.
 * @scope
 *  - The type of each layer and of the resolved configuration.
 *  - NOT: the parser, the merge, and the validation. The code does them.
 * @invariants
 *  - A layer holds the keys of its own type.
 *  - A value of a later layer wins over the value of an earlier layer.
 * @keywords config, toml, patch, preset, scope
 * #endregion moduleContract
 */

/** A count of bytes of UTF-8 text. */
export type Bytes = number;

/** A count of days. */
export type Days = number;

/** A path on the machine. A leading tilde is the home directory. */
export type Path = string;

/** A duration with a unit, for example `120s`, `5m`, or `2h`. */
export type Duration = `${number}${"s" | "m" | "h"}`;

/** A glob over the whole key. The part `*` matches any text. */
export type Glob = string;

/** The first part of a scope key. */
export type ScopeKind =
	| "project"
	| "global"
	| "agent"
	| "user"
	| "topic"
	| "task"
	| "import";

/**
 * A scope key of the form `kind:name`.
 *
 * The store lowercases the key before the check. The name starts with a lowercase letter or a
 * digit, and it holds lowercase letters, digits, the period, the underscore, the slash, and the
 * hyphen after that.
 */
export type ScopeKey = `${ScopeKind}:${string}`;

/** The backend of the store. */
export type StoreBackend = "sqlite" | "jsonl";

/** The memory that a subagent gets. */
export type SubagentMode = "propose" | "read" | "off";

/** The trigger of the nudge. */
export type NudgeMode = "tools" | "turns" | "expensive" | "off";

/** The shape of a run of the compactor. */
export type WriterMode = "parallel" | "batch" | "auto";

export interface StoreConfig {
	backend: StoreBackend;
	path: Path;
}

export interface Budget {
	/** The size limit of the tree of the active scope. */
	here: Bytes;
	/** The size limit of the tree of the catalog. */
	directions: Bytes;
}

export interface ProfileConfig {
	/** The scopes that the profile sees. A key is a glob. */
	scopes: Glob[];
	budget?: Partial<Budget>;
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
	mode: NudgeMode;
	tool_calls: number;
	turns: number;
	expensive: number;
	/** The line of the nudge. `{n}` takes the count. */
	text: string;
}

export interface WriterConfig {
	provider: string;
	model: string;
	effort: string;
	mode: WriterMode;
	batch: number;
	maxCallsPerHour: number;
}

export interface ReviewConfig {
	decision: Days;
	preference: Days;
	note: Days;
	fact: Days;
	task: Days;
}

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
	store?: StoreConfig;
	defaultProfile?: string;
	budget?: Partial<Budget>;
	writer?: Partial<WriterConfig>;
	nudge?: Pick<NudgeConfig, "mode" | "tool_calls">;
	cacheTtl?: CacheTtl;
	customPrompt?: string;
	customPromptAppend?: string;
}

/** The agent preset. `profile` is the only required key. */
export interface PresetConfig {
	profile: string;
	writer?: Partial<WriterConfig>;
	budget?: Partial<Budget>;
}

/** The configuration that the code uses, after the merge and the defaults. */
export interface ResolvedConfig extends Omit<BaseConfig, "profile"> {
	profile: ProfileConfig;
	budget: Budget;
	cacheTtl: CacheTtl;
	customPrompt: string | null;
	customPromptAppend: string | null;
}

/** The result is the deep merge of the three layers: the base, the patch, and the preset. */
export function resolveConfig(
	base: BaseConfig,
	patch: PatchConfig,
	preset: PresetConfig | null,
): ResolvedConfig;

/** `--store` wins over `MEMLENS_STORE`, and `MEMLENS_STORE` wins over the base file. */
export function storePath(
	flag: Path | null,
	env: Path | null,
	base: StoreConfig,
): Path;
