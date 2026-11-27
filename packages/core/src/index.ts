/**
 * #region moduleContract
 * @modulecontract
 * @purpose Expose the core contracts, domain functions, and shared scope resolver through one library entry point.
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
	activeScope,
	automaticScope,
	normalizeRemote,
	type RuleTrace,
	type RuleVerdict,
	repoName,
	resolveScope,
	type ScopeResolution,
	type ScopeSubject,
	visibleScopes,
	withActiveScope,
} from "./domain/active-scope.js";
export { parseAddress } from "./domain/address.js";
export { renderAddress } from "./domain/address-form.js";
export {
	compactionPass,
	publishRound,
	RateWindow,
	retryDelay,
} from "./domain/compaction.js";
export {
	expandTilde,
	globMatches,
	loadBaseConfig,
	loadPatchConfig,
	loadPresetConfig,
	nativeDirs,
	profileNames,
	resolveConfig,
	storePath,
} from "./domain/config.js";
export {
	type BaseConfig,
	type Budget,
	type CompactionConfig,
	DEFAULT_REVIEW_DAYS,
	NUDGE_TEXTS,
	type PatchConfig,
	type PresetConfig,
	type ResolvedConfig,
	type Rule,
	type ScopeDefault,
	type StoreConfig,
	type SubagentMode,
} from "./domain/config-types.js";
export {
	CONSOLE_SCREENS,
	type ConsoleModel,
	type ConsoleScreen,
	readConsole,
} from "./domain/console.js";
export {
	allowedScope,
	type ConsoleChildren,
	type ConsoleEntry,
	type ConsoleHost,
	type ConsoleViewAnswer,
	consoleAction,
	consoleCatalog,
	consoleOpen,
	consoleSearch,
	consoleView,
	type Fields,
	text,
} from "./domain/console-backend.js";
export {
	CONTEXT_TEMPLATE,
	type ContextInput,
	directionLines,
	hereLines,
	POLICY,
	renderContext,
} from "./domain/context.js";
export { dayOf, parseDay } from "./domain/day.js";
export {
	answerLine,
	batchTask,
	childLine,
	copyBuild,
	joinBuild,
	MERGE_SYSTEM,
	MERGE_SYSTEM_BATCH,
	type MergeModel,
	mergeLine,
	mergeTask,
	NODE_TARGET,
	parseBatchAnswer,
} from "./domain/merge-line.js";
export {
	BODY_HARD_LIMIT,
	normalizeBody,
	splitBody,
} from "./domain/note-body.js";
export {
	type DueRecord,
	dueRecords,
	LONGFORM_ALL,
	LONGFORM_HEAD,
	loadRangeView,
	type OpenChildren,
	type OpenEntry,
	type OpenLine,
	openNote,
	openRange,
	scopeLines,
} from "./domain/reads.js";
export {
	concreteScopeKey,
	isCatalogKey,
	normalizeScopeKey,
	validateScopeKey,
} from "./domain/scope.js";
export { resolveTarget } from "./domain/target.js";
export {
	addDaysAtTime,
	compareIso,
	MAX_ADD_DAYS,
	nowIso,
	parseNoteTime,
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
	resolveScopeContext,
	type ScopeContextResult,
} from "./scope-context.js";

export {
	candidates,
	childOf,
	publishJoin,
	publishNode,
	type RoundEntry,
	readBuild,
	readRound,
} from "./store/build.js";

export {
	amend,
	hide,
	linkSupersedes,
	move,
	note,
	noteTx,
	redact,
	restore,
	review,
} from "./store/notes.js";
export {
	accept,
	dismiss,
	pending,
	propose,
	sweep,
} from "./store/proposals.js";
export {
	byAddress,
	byId,
	type DirectionLine,
	directionsData,
	dueReviews,
	type JournalRow,
	journalRows,
	liveCounts,
	newestScope,
	nodesOf,
	scopeNotes,
} from "./store/reads.js";
export { check } from "./store/repair.js";
export {
	FIND_DEFAULT_LIMIT,
	type FindFilter,
	search,
} from "./store/search.js";
export { Store } from "./store/store.js";
export {
	exportLines,
	importLines,
} from "./store/transfer.js";

export type {
	IndexHit,
	Node,
	Note,
	Proposal,
	WriteResult,
} from "./store/types.js";
export {
	joinText,
	loadView,
	nodeValid,
	sliceOf,
	textOfLine,
	topLineOf,
	type View,
} from "./store/view.js";
export { MemlensError } from "./types/errors.js";
export {
	NOTE_KINDS,
	type NoteKind,
	type ScopeKey,
} from "./types/primitives.js";

export type {
	BuildChild,
	BuildInput,
	Level,
	Range,
	SliceLine,
} from "./types/tree.js";
