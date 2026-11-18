/**
 * Console read routes.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Answer each console read from the store, so the browser shows one view without a store
 *   handle of its own.
 * @scope
 *  - The routes view, search, open, and catalog.
 *  - NOT: the action route, the transport, and the scope rules.
 * @usecases
 *  - View: client => asks for one scope => gets the console model
 * @dependencies USES API: @memlens/core
 * @keywords ui, view, search, open, catalog, read
 * #endregion moduleContract
 */

import type { ScopeKey } from "@memlens/core";
import {
	byAddress,
	filterHits,
	loadRangeView,
	MemlensError,
	nowIso,
	openNote,
	openRange,
	parseAddress,
	pending,
	profileNames,
	readConsole,
	search,
} from "@memlens/core";
import type { Runtime } from "../runtime.js";
import { type Fields, type Handler, type HostOptions, text } from "./http.js";
import { allowedScope, noteKind } from "./scope.js";

// #region FUNC_viewAnswer
/**
 * @purpose Give the console model of one scope with its proposals and its policy.
 * @invariants The answer holds the pending proposals, the profile names, and the review policy.
 */
async function viewAnswer(
	runtime: Runtime,
	fields: Fields,
	scope: ScopeKey,
	options: HostOptions,
): Promise<unknown> {
	const kind = text(fields, "kind");
	const model = await readConsole(
		runtime.store,
		runtime.config,
		scope,
		undefined,
		kind ? noteKind(kind) : null,
	);
	return {
		...model,
		proposals: pending(runtime.store),
		profiles: profileNames(runtime.base, runtime.base.defaultProfile),
		path: runtime.path,
		backend: "sqlite",
		allowDelete: options.allowDelete === true,
		reviewPolicy: runtime.config.review,
	};
}
// #endregion FUNC_viewAnswer

// #region FUNC_searchAnswer
/**
 * @purpose Answer one search over the requested scope or each visible scope.
 * @invariants The flag limit is a whole number from 0 to 1000, and the kind narrows the hits.
 */
function searchAnswer(
	runtime: Runtime,
	fields: Fields,
	scope: ScopeKey,
): unknown {
	const raw = text(fields, "limit") || "10";
	if (!/^\d+$/.test(raw) || Number(raw) > 1000)
		throw new MemlensError("Usage", "The limit must be between 0 and 1000.");
	const scopes = text(fields, "scope") ? [scope] : runtime.scopes;
	const hits = scopes.flatMap((key) =>
		search(runtime.store, text(fields, "query"), key, 50),
	);
	const kind = text(fields, "kind");
	return filterHits(
		hits,
		{
			scopes,
			limit: Number(raw),
			since: text(fields, "since"),
			...(kind ? { kinds: [noteKind(kind)] } : {}),
		},
		nowIso(),
	);
}
// #endregion FUNC_searchAnswer

// #region FUNC_openAnswer
/**
 * @purpose Give one note with its document, or the children of one range.
 */
function openAnswer(
	runtime: Runtime,
	fields: Fields,
	scope: ScopeKey,
): unknown {
	const address = parseAddress(text(fields, "target"));
	if (!address)
		throw new MemlensError("Usage", "The target must be an address.");
	const key = allowedScope(runtime, address.scope ?? scope);
	if (address.kind === "range" || address.kind === "scoped-range")
		return openRange(
			key,
			loadRangeView(runtime.store, key),
			address.start,
			address.end,
		);
	const row = byAddress(runtime.store, key, address.pos);
	if (!row) throw new MemlensError("Data", "The note does not exist.");
	return openNote(key, row, "all");
}
// #endregion FUNC_openAnswer

// #region FUNC_catalogAnswer
/**
 * @purpose Give the catalog lines below one range, so the browser draws one level.
 * @invariants The start is a whole number from 0. The level is a whole number from 1 to 31.
 */
async function catalogAnswer(
	runtime: Runtime,
	fields: Fields,
	scope: ScopeKey,
): Promise<unknown> {
	const start = Number(text(fields, "start"));
	const level = Number(text(fields, "level"));
	if (
		!Number.isInteger(start) ||
		start < 0 ||
		!Number.isInteger(level) ||
		level < 1 ||
		level > 31
	)
		throw new MemlensError("Usage", "The catalog target must be a range.");
	const model = await readConsole(runtime.store, runtime.config, scope);
	return model.catalog.slice(start, start + 2 ** level);
}
// #endregion FUNC_catalogAnswer

/** Each read route of the console. */
export const READ_ROUTES: Readonly<Record<string, Handler>> = {
	"/api/view": viewAnswer,
	"/api/search": searchAnswer,
	"/api/open": openAnswer,
	"/api/catalog": catalogAnswer,
};
