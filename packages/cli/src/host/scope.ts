/**
 * Console scope rules.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Resolve the scope and the target of one request, so each handler works on one listed
 *   scope.
 * @scope
 *  - The requested scope, the active scope, the listed scope check, the note kind, and the target
 *    row.
 *  - NOT: the HTTP transport and the action semantics.
 * @invariants A scope outside the profile gives NotAllowed.
 * @usecases
 *  - View: client => gives no scope => gets the active scope or the first listed scope
 * @dependencies USES API: @memlens/core, commands.ts, runtime.ts, host/http.ts
 * @keywords ui, scope, profile, target, kind, resolve
 * #endregion moduleContract
 */

import type { Note, NoteKind, ScopeKey } from "@memlens/core";
import {
	byAddress,
	MemlensError,
	NOTE_KINDS,
	newestScope,
	parseAddress,
	validateScopeKey,
} from "@memlens/core";
import { cliActiveScope, profileLists, type Runtime } from "../runtime.js";
import { type Fields, type HostOptions, text } from "./http.js";

// #region FUNC_allowedScope
/**
 * Check one scope against the profile of the runtime.
 *
 * @purpose Refuse a scope outside the profile, so a request changes no record of another profile.
 * @invariants An invalid key gives a Usage error. An unlisted key gives NotAllowed.
 */
export function allowedScope(runtime: Runtime, raw: string): ScopeKey {
	if (!validateScopeKey(raw))
		throw new MemlensError("Usage", "The scope key is invalid.");
	if (!profileLists(runtime, raw))
		throw new MemlensError("NotAllowed", "The scope is outside this profile.");
	return raw;
}
// #endregion FUNC_allowedScope

// #region FUNC_resolveScope
/**
 * Resolve the scope of one request.
 *
 * @purpose Give each request one listed scope, so the handlers share the default rule.
 * @invariants A requested scope wins. With no request, the scope of the newest live note applies,
 *   else the active scope of the directory applies when the profile lists it, and the first visible
 *   scope applies otherwise.
 */
export function resolveScope(
	runtime: Runtime,
	fields: Fields,
	options: HostOptions,
): ScopeKey {
	const requested = text(fields, "scope");
	const visible = runtime.scopes;
	const fresh = requested ? null : newestScope(runtime.store, visible);
	const fallback = cliActiveScope(runtime.base, options.cwd ?? process.cwd());
	const first =
		visible[0] ??
		runtime.config.profile.scopes.find(validateScopeKey) ??
		fallback;
	return allowedScope(
		runtime,
		requested || fresh || (profileLists(runtime, fallback) ? fallback : first),
	);
}
// #endregion FUNC_resolveScope

/** @purpose Give the note kind of one field, or a Usage error. */
export function noteKind(raw: string): NoteKind {
	if (!(NOTE_KINDS as readonly string[]).includes(raw))
		throw new MemlensError("Usage", "The kind is unknown.");
	return raw as NoteKind;
}

/** @purpose Give the one note row that a target address names. */
export function targetRecord(
	runtime: Runtime,
	fallback: ScopeKey,
	target: string,
): Note {
	const address = parseAddress(target);
	if (!address || address.kind === "range" || address.kind === "scoped-range")
		throw new MemlensError("Usage", "The target must name one note.");
	const scope = allowedScope(runtime, address.scope ?? fallback);
	const row = byAddress(runtime.store, scope, address.pos);
	if (!row) throw new MemlensError("Data", "The note does not exist.");
	return row;
}
