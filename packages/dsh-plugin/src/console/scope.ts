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
 * @invariants A request whose store is not open resolves its scope from no row.
 * @dependencies USES API: @memlens/core
 * @keywords console, scope, profile, target, kind, request, field
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
	byAddress,
	MemlensError,
	NOTE_KINDS,
	type Note,
	type NoteKind,
	newestScope,
	parseAddress,
	type ScopeKey,
	validateScopeKey,
} from "@memlens/core";
import type { AgentMemory } from "../service.js";
import { listedInProfile, visibleScopeList } from "../tools/shared.js";

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
	if (!(NOTE_KINDS as readonly string[]).includes(raw))
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
 * @invariants A requested scope wins. With no request, the newest listed scope applies when the
 *   caller asks for it, else the active scope of the session applies when the profile lists it, and
 *   the first visible scope applies otherwise.
 * @invariants A store that is not open reads no row, so the profile scopes and the active scope
 *   give the answer. That answer needs no listed scope, because the store serves no read. The
 *   fallback takes no scope pattern, so the answer names one concrete scope.
 *   A surface then reports the store state and no failed scope.
 */
export function requestScope(
	memory: AgentMemory,
	requested: string,
	newest = false,
): ScopeKey {
	if (requested) return allowedScope(memory, requested);
	const visible = memory.storeState.ready ? visibleScopeList(memory) : [];
	const active = memory.scope;
	const fresh =
		newest && visible.length > 0 ? newestScope(memory.store, visible) : null;
	const first =
		visible[0] ??
		memory.config.profile.scopes.find(
			(key): key is ScopeKey => validateScopeKey(key) && !key.includes("*"),
		) ??
		active;
	const scope = fresh ?? (listedInProfile(memory, active) ? active : first);
	debug("Scope resolved", {
		event: "scope",
		scope,
		active,
		requested: requested !== "",
	});
	// A store that is not open serves no read, so the answer states the fallback without the profile
	// check. A requested scope still passes the check, because the request names it.
	return requested === "" && !memory.storeState.ready
		? scope
		: allowedScope(memory, scope);
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
