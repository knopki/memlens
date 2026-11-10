/**
 * Core module of memlens.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Expose the core contracts and pure domain functions through one library entry point.
 * @scope
 *  - The public value of the library.
 *  - The types from types/ as public exports.
 *  - NOT: the CLI, the plugin, the harness, and the user interface.
 * @invariants
 *  - The module imports no CLI, plugin, or user interface package.
 *  - The library does not know the CLI, the plugin, or the user interface.
 * @keywords memlens, library, name, types
 * #endregion moduleContract
 */

/** The product name. The CLI frontend and the plugin use this value. */
export const NAME = "memlens";

export {
	type ParsedAddress,
	parseAddress,
	renderAddress,
} from "./domain/address.js";
export {
	type InvalidationPlan,
	type ProfileScopes,
	planInvalidation,
} from "./domain/invalidation.js";
export {
	canonicalJson,
	type MergeResult,
	mergeEvents,
} from "./domain/merge.js";
export {
	BODY_DECLARED_SIZE,
	BODY_HARD_LIMIT,
	LONGFORM_LIMIT,
	normalizeBody,
	splitBody,
} from "./domain/note-body.js";
export { compareOrder, makeOrder, maxOrder } from "./domain/order.js";
export { catalogTree, project, scopeTree } from "./domain/projection.js";
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
	type OpenChildren,
	type OpenEntry,
	type OpenLine,
	openNote,
	openRange,
	type ScopeLine,
	scopeLines,
} from "./domain/reads.js";
export { redactionClosure, sanitizeEvent } from "./domain/sanitization.js";
export {
	CATALOG_PREFIX,
	catalogKey,
	isCatalogKey,
	normalizeScopeKey,
	validateScopeKey,
} from "./domain/scope.js";
export {
	addDays,
	compareIso,
	nowIso,
	toIso,
	toIsoDate,
} from "./domain/time.js";
export {
	buildInput,
	candidates,
	currentNode,
	due,
	fold,
	inputUnchanged,
	isBuilt,
	isClean,
	rev,
	slice,
	topRange,
} from "./domain/tree.js";
export { isUlid, ulid } from "./domain/ulid.js";
export {
	normalizeAppend,
	validateEvent,
	validateTargets,
} from "./domain/validation.js";
export {
	prepareAppend,
	prepareImport,
	type WritePlan,
} from "./domain/write.js";
export { FtsIndex } from "./storage/fts.js";
export { JsonlStore } from "./storage/jsonl.js";
export { SqliteStore } from "./storage/sqlite.js";
export { type ErrorCode, MemlensError } from "./types/errors.js";
// Type exports
export type {
	AmendEvent,
	DismissEvent,
	Event,
	HideEvent,
	InvalidateEvent,
	IsoDate,
	IsoTime,
	JsonlLine,
	NodeEvent,
	NoteEvent,
	NoteKind,
	RedactEvent,
	ReviewEvent,
	SanitizedAmendEvent,
	SanitizedEvent,
	SanitizedNodeEvent,
	SanitizedNoteEvent,
	ScopeKey,
	Ulid,
} from "./types/events.js";
export type {
	Projection,
	ProjectionRecord,
	RangeNode,
	RecordState,
	ScopeCount,
	SlotRev,
} from "./types/projection.js";
export { PROJECTION_VERSION } from "./types/projection.js";
export type {
	AppendEvent,
	IndexHit,
	IndexPort,
	NodeAppendResult,
	StorePort,
	StoreRev,
} from "./types/store.js";
export type {
	BuildChild,
	BuildInput,
	Id,
	Level,
	Lines,
	Order,
	Pos,
	Range,
	Rev,
	SliceLine,
	Tree,
	TreeNode,
	TreeRecord,
} from "./types/tree.js";
