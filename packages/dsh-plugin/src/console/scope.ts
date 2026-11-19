/**
 * #region moduleContract
 * @purpose Resolve the fields and the scope of one console request, so every handler works on one
 *   scope that the profile of the request lists.
 * @scope
 *  - The request type, the request scope, and the backend context of one memory.
 *  - NOT: the transport, the reads, the actions, the status, and the listed scope check.
 * @invariants An invalid scope key gives Usage. A scope outside the profile of the request gives
 *   NotAllowed.
 * @invariants The session supplies the active scope and the profile of a session request. A profile
 *   request names its profile, and the host file gives its fallback scope.
 * @invariants A request whose store is not open resolves its scope from no row.
 * @dependencies USES API: @memlens/core
 * @keywords console, scope, profile, request, field, host
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
	allowedScope,
	type ConsoleHost,
	type Fields,
	newestScope,
	type ScopeKey,
	validateScopeKey,
} from "@memlens/core";
import type { AgentMemory } from "../service.js";
import { listedInProfile, visibleScopeList } from "../tools/shared.js";

const debug = debuglog("memlens:plugin:console");

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

// #region FUNC_hostOf
/** @purpose Give the backend context of one memory, so one adapter holds no host rule. */
export function hostOf(memory: AgentMemory): ConsoleHost {
	return {
		store: memory.store,
		config: memory.config,
		scopes: visibleScopeList(memory),
	};
}
// #endregion FUNC_hostOf

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
	if (requested) return allowedScope(hostOf(memory), requested);
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
		: allowedScope(hostOf(memory), scope);
}
// #endregion FUNC_requestScope
