/**
 * #region moduleContract
 * @modulecontract
 * @purpose Expose the core contracts and pure domain functions through one library entry point.
 * @scope
 *  - The public value of the library.
 *  - The types from types/ as public exports.
 *  - NOT: the CLI, the plugin, the harness, and the user interface.
 * @invariants
 *  - The module imports no CLI, plugin, or user interface package.
 * @keywords memlens, library, name, types
 * #endregion moduleContract
 */

/** The product name. The CLI frontend and the plugin use this value. */
export const NAME = "memlens";

export {
	type ActiveScope,
	activeScope,
	automaticScope,
	repoName,
	type ScopeSubject,
	visibleScopes,
	withActiveScope,
} from "./domain/active-scope.js";
export {
	type ParsedAddress,
	parseAddress,
	renderAddress,
} from "./domain/address.js";
export {
	autoForm,
	COMPACTION_BATCH,
	COMPACTION_PARALLEL,
	type CompactionRun,
	compactionPass,
	type PassResult,
	RateWindow,
	RETRY_WAITS,
	retryDelay,
} from "./domain/compaction.js";
export {
	expandTilde,
	globMatches,
	loadBaseConfig,
	loadPatchConfig,
	loadPresetConfig,
	parseDuration,
	resolveConfig,
	storePath,
	ttlSeconds,
	xdgDirs,
} from "./domain/config.js";
export {
	type BaseConfig,
	type Budget,
	type CacheTtl,
	type CompactionConfig,
	type CompactionMode,
	type Days,
	DEFAULT_CACHE_TTL,
	DEFAULT_CONFIG_TOML,
	DEFAULT_REVIEW_DAYS,
	type Duration,
	type Glob,
	NUDGE_TEXTS,
	type PatchConfig,
	type Path,
	type PresetConfig,
	type ProfileConfig,
	type ResolvedConfig,
	type ReviewConfig,
	type Rule,
	type RuleGitRemote,
	type RulePath,
	type RuleWorkspace,
	type ScopeDefault,
	type StoreConfig,
	type SubagentMode,
} from "./domain/config-types.js";
export {
	type ConsoleModel,
	candidatesOf,
	readConsole,
} from "./domain/console.js";
export {
	CONTEXT_TEMPLATE,
	type ContextInput,
	directionLines,
	epoch,
	hereLines,
	POLICY,
	renderContext,
} from "./domain/context.js";
export {
	answerLine,
	batchTask,
	childLine,
	copyBuild,
	joinBuild,
	type LineBuild,
	MERGE_SYSTEM,
	type MergeModel,
	mergeLine,
	mergeTask,
	NODE_ATTEMPTS,
	NODE_LIMIT,
	NODE_TARGET,
	parseBatchAnswer,
	RETRY_FACTOR,
} from "./domain/merge-line.js";
export {
	BODY_HARD_LIMIT,
	LONGFORM_LIMIT,
	normalizeBody,
	splitBody,
} from "./domain/note-body.js";
export {
	type DueRecord,
	dueRecords,
	FIND_DEFAULT_LIMIT,
	FIND_MAX_PER_SCOPE,
	type FindFilter,
	filterHits,
	LONGFORM_ALL,
	LONGFORM_HEAD,
	type LongformMode,
	loadRangeView,
	type OpenChildren,
	type OpenEntry,
	type OpenLine,
	type OpenSubject,
	openNote,
	openRange,
	type ReadSource,
	type ScopeLine,
	scopeLines,
} from "./domain/reads.js";
export {
	CATALOG_PREFIX,
	isCatalogKey,
	normalizeScopeKey,
	validateScopeKey,
} from "./domain/scope.js";
export {
	addDaysAtTime,
	compareIso,
	nowIso,
	toIso,
} from "./domain/time.js";
export {
	cutAtWord,
	due,
	foldPositions,
	joinBody,
	LINE_LIMIT,
	topRangeOf,
} from "./domain/tree.js";
export { ulid } from "./domain/ulid.js";
export {
	type BuildRead,
	candidates,
	publishJoin,
	publishNode,
	readBuild,
} from "./store/build.js";
export {
	type AmendInput,
	amend,
	amendTx,
	hide,
	hideTx,
	linkSupersedes,
	type NoteInput,
	note,
	noteCheckedTx,
	noteTx,
	redact,
	review,
	reviewTx,
} from "./store/notes.js";
export {
	accept,
	dismiss,
	type ProposalInput,
	pending,
	propose,
	sweep,
} from "./store/proposals.js";
export {
	byAddress,
	byId,
	type DirectionLine,
	type DirectionsData,
	directionsData,
	dueReviews,
	liveCounts,
	nodesOf,
	scopeNotes,
} from "./store/reads.js";
export { check, type RepairOptions } from "./store/repair.js";
export { search } from "./store/search.js";
export { Store } from "./store/store.js";
export {
	exportLines,
	type ImportOptions,
	type ImportResult,
	importLines,
} from "./store/transfer.js";

export type {
	IndexHit,
	Node,
	Note,
	NoteState,
	Proposal,
	ProposalStatus,
	StoreRev as RowStoreRev,
	WriteResult,
} from "./store/types.js";
export {
	joinText,
	loadView,
	nodeAt,
	nodeValid,
	notesInRange,
	sliceOf,
	textOfLine,
	topLineOf,
	totalOf,
	type View,
} from "./store/view.js";
export { type ErrorCode, MemlensError } from "./types/errors.js";

export type {
	IsoTime,
	NoteKind,
	ScopeKey,
	Ulid,
} from "./types/primitives.js";

export type {
	BuildChild,
	BuildInput,
	Level,
	Lines,
	Pos,
	Range,
	SliceLine,
} from "./types/tree.js";
