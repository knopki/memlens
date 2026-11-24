/**
 * #region moduleContract
 * @purpose Give each tool module one copy of the tool types and one copy of the store helpers.
 * @scope The input and output types of the tools, the profile check, the target read, the note time,
 *  and the review time.
 *  NOT: the tool schemas, the registration, and the parent report.
 * @invariants A scope field of an input is key text, and the helper normalizes it before the profile check.
 * @dependencies USES API: @memlens/core, @deepseek-ai/dsh-llm
 * @keywords memlens, tool, type, scope, profile, target, review, address
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import {
	addDaysAtTime,
	globMatches,
	isCatalogKey,
	liveCounts,
	MemlensError,
	NOTE_KINDS,
	type Note,
	type NoteKind,
	normalizeScopeKey,
	parseNoteTime,
	resolveTarget as resolveCoreTarget,
	type ScopeKey,
	validateScopeKey,
	visibleScopes,
} from "@memlens/core";
import type { AgentMemory } from "../service.js";

export const debug = debuglog("memlens:plugin:tools");

/** The address of a record: `pos`, `pos-pos`, `scope#pos`, or `scope#pos-pos`. */
export type Address = string;

export interface MemoryNoteInput {
	body: string;
	longform?: string | undefined;
	// The scope text of the call. The tool normalizes it.
	scope?: string | undefined;
	kind?: NoteKind | undefined;
	supersedes?: (number | string)[] | undefined;
	reviewIn?: string | undefined;
	// The time of the note. The tool normalizes it to ISO 8601 UTC.
	ts?: string | undefined;
}

export type MemoryNoteOutput =
	| { addr: Address; id: string; state: "live" }
	| { id: string; proposed: true };

export interface MemoryFindInput {
	query?: string | undefined;
	scopes?: string[] | undefined;
	since?: string | undefined;
	until?: string | undefined;
	kinds?: NoteKind[] | undefined;
	due?: boolean | undefined;
	limit?: number | undefined;
}

export interface MemoryFindHit {
	addr: Address;
	scope: ScopeKey;
	pos: number;
	id: string;
	ts: string;
	kind: NoteKind;
	body: string;
	longformChars: number;
	review_at: string | null;
}

export interface MemoryFindOutput {
	hits: MemoryFindHit[];
}

export interface MemoryOpenInput {
	target: string | number;
	longform?: "none" | "head" | "all" | undefined;
	offset?: number | undefined;
}

export interface MemoryOpenEntry {
	kind: "entry";
	addr: Address;
	pos: number;
	id: string;
	ts: string;
	scope: ScopeKey;
	body: string;
	longform?: string;
	longformChars: number;
	longformOffset: number;
	longformTruncated: boolean;
	review_at: string | null;
	refs: string[];
}

export interface MemoryOpenLine {
	addr: Address;
	ts_from: string;
	ts_to: string;
	text: string;
	built: boolean;
	chars: number;
}

export interface MemoryOpenChildren {
	kind: "children";
	children: MemoryOpenLine[];
}

export type MemoryOpenOutput = MemoryOpenEntry | MemoryOpenChildren;

export interface MemoryForgetInput {
	targets: (number | string)[];
	scope?: string | undefined;
	reason: string;
}

export type MemoryForgetOutput = Record<string, never>;

export interface MemoryReviewInput {
	scope?: string | undefined;
	reviewed?: (number | string)[] | undefined;
	reviewIn?: string | undefined;
}

export interface MemoryReviewDue {
	addr: Address;
	scope: ScopeKey;
	pos: number;
	ts: string;
	kind: NoteKind;
	body: string;
	review_at: string | null;
}

export type MemoryReviewOutput =
	| { due: MemoryReviewDue[] }
	| { reviewed: number; next: string };

export interface MemoryMapInput {
	scope?: string | undefined;
}

export interface MemoryDirectionLine {
	keys: ScopeKey[];
	ts_from: string;
	ts_to: string;
	text: string;
}

export type MemoryMapOutput =
	| { kind: "scopes"; lines: MemoryDirectionLine[] }
	| { kind: "scope"; scope: ScopeKey; lines: MemoryOpenLine[] };

// #region FUNC_blocks
/** The text answer of one tool call, as the model reads it. */
export function blocks(text: string): ContentBlock[] {
	return [{ type: "text", text }];
}
// #endregion FUNC_blocks

// #region FUNC_listedInProfile
/**
 * @purpose Report whether the globs of the profile show one scope key.
 * @invariants A catalog key stays hidden, and each glob matches the whole key.
 */
export function listedInProfile(memory: AgentMemory, scope: ScopeKey): boolean {
	return (
		!isCatalogKey(scope) &&
		memory.config.profile.scopes.some((glob) => globMatches(glob, scope))
	);
}
// #endregion FUNC_listedInProfile

// #region FUNC_checkedScope
/**
 * @purpose Give one visible scope key, or refuse the scope with NotAllowed.
 * @param memory - The store, the profile, and the active scope of the agent.
 * @param raw - The scope text of the tool call.
 * @returns The normalized key of the scope.
 */
export function checkedScope(memory: AgentMemory, raw: string): ScopeKey {
	const scope = normalizeScopeKey(raw) as ScopeKey;
	if (!listedInProfile(memory, scope))
		throw new MemlensError("NotAllowed", `The scope ${scope} is not visible.`);
	return scope;
}
// #endregion FUNC_checkedScope

// #region FUNC_visibleScopeList
/**
 * @purpose List each scope that the profile shows and the store holds a live note in.
 * @invariants The order comes from the store, and the profile globs add their literal keys.
 */
export function visibleScopeList(memory: AgentMemory): ScopeKey[] {
	const known = [...liveCounts(memory.store).keys()];
	const literals = memory.config.profile.scopes.filter(validateScopeKey);
	return visibleScopes(memory.config.profile.scopes, [
		...new Set([...known, ...literals]),
	]);
}
// #endregion FUNC_visibleScopeList

export function resolveTarget(
	memory: AgentMemory,
	fallback: ScopeKey,
	target: number | string,
	canSee: (raw: string) => ScopeKey = (raw) => checkedScope(memory, raw),
): Note {
	return resolveCoreTarget(memory.store, fallback, target, canSee);
}

// #region FUNC_reviewTime
/**
 * @purpose Give the next review time of one note from its period or its kind.
 * @invariants `never` gives null. An absent period gives the days of the kind.
 */
export function reviewTime(
	memory: AgentMemory,
	kind: NoteKind,
	reviewIn: string | undefined,
): string | null {
	if (reviewIn === "never") return null;
	if (reviewIn === undefined)
		return addDaysAtTime(Date.now(), memory.config.review[kind]);
	const days = /^(\d+)d$/.exec(reviewIn);
	if (days === null)
		throw new MemlensError(
			"Usage",
			`The review period ${reviewIn} is not a count of days or never.`,
		);
	return addDaysAtTime(Date.now(), Number(days[1]));
}
// #endregion FUNC_reviewTime

// #region FUNC_noteTime
/**
 * @purpose Give the time of one note in the stored form, so a call names the moment of the note.
 * @invariants An absent value gives undefined, and the store takes the write time.
 * @invariants A value that is not a date gives a Usage error.
 * @param ts - The time of the tool call as ISO 8601 text, a day as YYYY-MM-DD, or none.
 * @returns The time as ISO 8601 UTC with Z, or undefined.
 */
export function noteTime(ts: string | undefined): string | undefined {
	if (ts === undefined) return undefined;
	const time = parseNoteTime(ts);
	if (time === null)
		throw new MemlensError("Usage", `The time ${ts} is not a date.`);
	return time;
}
// #endregion FUNC_noteTime
