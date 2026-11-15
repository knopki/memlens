/**
 * #region moduleContract
 * @purpose Resolve the fields, the scope, and the target of one console request, so every handler
 *   works on one scope that the profile of the request lists.
 * @scope
 *  - The request fields, the note kind, the listed scope check, the request scope, and the target
 *    row.
 *  - NOT: the transport, the reads, the actions, and the status.
 * @invariants An invalid scope key gives Usage. A scope outside the profile of the request gives
 *   NotAllowed.
 * @invariants The session supplies the active scope and the profile of a session request. A profile
 *   request names its profile, and the host file gives its fallback scope.
 * @dependencies USES API: @memlens/core, ../service.ts, ../tools/shared.ts
 * @keywords console, scope, profile, target, kind, request, field
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
	byAddress,
	MemlensError,
	type Note,
	type NoteKind,
	parseAddress,
	type ScopeKey,
	validateScopeKey,
} from "@memlens/core";
import type { AgentMemory } from "../service.js";
import { KINDS, listedInProfile, visibleScopeList } from "../tools/shared.js";

const debug = debuglog("memlens:plugin:console");

/** One request body or query, with the fields of the console. */
export type Fields = Record<string, unknown>;

// #region INTERFACE_ConsoleRequest
/**
 * @purpose Give each console handler the memory inputs, the scope, the fields, and the profiles.
 * @invariants The transport resolves the surface. The handler reads no other profile or store.
 */
export interface ConsoleRequest {
	readonly memory: AgentMemory;
	readonly scope: ScopeKey;
	readonly fields: Fields;

	/** The live agent of a session request. A profile request holds none. */
	readonly agent?: Agent;

	/** The profile names of the base file, so the console offers each profile. */
	readonly profiles: readonly string[];
}
// #endregion INTERFACE_ConsoleRequest

// #region FUNC_text
/**
 * @purpose Give one text field of the request, so a value of a wrong type gives a Usage error.
 * @param fields - The query and body fields of one request.
 * @param key - The field name.
 * @returns The text, or an empty text when the field is absent.
 */
export function text(fields: Fields, key: string): string {
	const value = fields[key];
	if (value === undefined) return "";
	if (typeof value !== "string")
		throw new MemlensError("Usage", `The field ${key} must be text.`);
	return value;
}
// #endregion FUNC_text

// #region FUNC_noteKind
/**
 * @purpose Give the note kind of one field, so an unknown kind gives a Usage error.
 * @param raw - The kind text of the request.
 * @returns The note kind.
 */
export function noteKind(raw: string): NoteKind {
	if (!(KINDS as readonly string[]).includes(raw))
		throw new MemlensError("Usage", "The kind is unknown.");
	return raw as NoteKind;
}
// #endregion FUNC_noteKind

// #region FUNC_allowedScope
/**
 * @purpose Refuse a scope outside the session profile, so a request changes no record of another
 *   profile.
 * @invariants An invalid key gives a Usage error. An unlisted key gives NotAllowed.
 * @param memory - The store and the profile of the session.
 * @param raw - The scope text of the request or of a target address.
 * @returns The checked scope key.
 */
export function allowedScope(memory: AgentMemory, raw: string): ScopeKey {
	if (!validateScopeKey(raw))
		throw new MemlensError("Usage", "The scope key is invalid.");
	if (!listedInProfile(memory, raw))
		throw new MemlensError("NotAllowed", "The scope is outside this profile.");
	return raw;
}
// #endregion FUNC_allowedScope

// #region FUNC_requestScope
/**
 * @purpose Give each console request one listed scope, so each handler shares the default rule.
 * @invariants A requested scope wins. With no request, the active scope of the session applies
 *   when the profile lists it, and the first visible scope applies otherwise.
 * @param memory - The store, the profile, and the active scope of the session.
 * @param requested - The scope text of the request, or an empty text.
 * @returns The checked scope key of the request.
 */
export function requestScope(memory: AgentMemory, requested: string): ScopeKey {
	if (requested) return allowedScope(memory, requested);
	const active = memory.scope;
	const first =
		visibleScopeList(memory)[0] ??
		memory.config.profile.scopes.find(validateScopeKey) ??
		active;
	const scope = listedInProfile(memory, active) ? active : first;
	debug("Scope resolved", {
		event: "scope",
		scope,
		active,
		requested: requested !== "",
	});
	return allowedScope(memory, scope);
}
// #endregion FUNC_requestScope

// #region FUNC_targetRecord
/**
 * @purpose Give the one note row that a target address names.
 * @invariants A range address gives a Usage error. A row outside the profile gives NotAllowed.
 * @param memory - The store and the profile of the session.
 * @param fallback - The scope of a target with no scope.
 * @param target - The address of the request.
 * @returns The note row of the address.
 */
export function targetRecord(
	memory: AgentMemory,
	fallback: ScopeKey,
	target: string,
): Note {
	const address = parseAddress(target);
	if (!address || address.kind === "range" || address.kind === "scoped-range")
		throw new MemlensError("Usage", "The target must name one note.");
	const scope = allowedScope(memory, address.scope ?? fallback);
	const row = byAddress(memory.store, scope, address.pos);
	if (!row) throw new MemlensError("Data", "The note does not exist.");
	return row;
}
// #endregion FUNC_targetRecord
