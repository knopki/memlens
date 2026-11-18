/**
 * #region moduleContract
 * @purpose Answer each console read from the store of the request, so a console shows one view
 *   without a store handle of its own.
 * @scope
 *  - The routes view, search, open, and catalog.
 *  - NOT: the action route, the transport, and the scope rules.
 * @invariants The answer fields and the defaults match the standalone console.
 * @usecases
 *  - View: tab => asks for one scope => gets the console model
 * @dependencies USES API: @memlens/core
 * @keywords console, view, search, open, catalog, read
 * #endregion moduleContract
 */

import { debuglog } from "node:util";
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
	readConsole,
	search,
} from "@memlens/core";
import { visibleScopeList } from "../tools/shared.js";
import { allowedScope, type ConsoleRequest, noteKind, text } from "./scope.js";

const debug = debuglog("memlens:plugin:console");

// #region FUNC_viewAnswer
/**
 * @purpose Give the console model of one scope with its proposals and its policy.
 * @invariants The answer holds the pending proposals, the profile names, and the review policy.
 * @invariants The plugin host permits the delete action through the harness Remote service.
 */
export async function viewAnswer(request: ConsoleRequest): Promise<unknown> {
	const { memory, scope, fields, profiles } = request;
	const kind = text(fields, "kind");
	const model = await readConsole(
		memory.store,
		memory.config,
		scope,
		undefined,
		kind ? noteKind(kind) : null,
	);
	debug("View answered", { event: "view", scope, kind });
	return {
		...model,
		proposals: pending(memory.store),
		profiles: [...profiles],
		path: memory.config.store.path,
		backend: "sqlite",
		allowDelete: true,
		reviewPolicy: memory.config.review,
	};
}
// #endregion FUNC_viewAnswer

// #region FUNC_searchAnswer
/**
 * @purpose Answer one search over the requested scope or each visible scope.
 * @invariants The limit is a whole number from 0 to 1000, and the kind narrows the hits.
 */
export function searchAnswer(request: ConsoleRequest): unknown {
	const { memory, scope, fields } = request;
	const raw = text(fields, "limit") || "10";
	if (!/^\d+$/.test(raw) || Number(raw) > 1000)
		throw new MemlensError("Usage", "The limit must be between 0 and 1000.");
	const visible = visibleScopeList(memory);
	const chosen = text(fields, "scope");
	const scopes = chosen ? [scope] : visible;
	const hits = scopes.flatMap((key) =>
		search(memory.store, text(fields, "q") || text(fields, "query"), key, 50),
	);
	const kind = text(fields, "kind");
	const answer = filterHits(
		hits,
		{
			scopes,
			limit: Number(raw),
			since: text(fields, "since"),
			...(kind ? { kinds: [noteKind(kind)] } : {}),
		},
		nowIso(),
	);
	debug("Search answered", {
		event: "search",
		scopes: scopes.length,
		hits: answer.length,
	});
	return answer;
}
// #endregion FUNC_searchAnswer

// #region FUNC_openAnswer
/**
 * @purpose Give one note with its document, or the children of one range.
 * @invariants The target must be an address. The offset is a whole number from 0.
 */
export function openAnswer(request: ConsoleRequest): unknown {
	const { memory, scope, fields } = request;
	const address = parseAddress(text(fields, "target"));
	if (!address)
		throw new MemlensError("Usage", "The target must be an address.");
	const key = allowedScope(memory, address.scope ?? scope);
	if (address.kind === "range" || address.kind === "scoped-range")
		return openRange(
			key,
			loadRangeView(memory.store, key),
			address.start,
			address.end,
		);
	const row = byAddress(memory.store, key, address.pos);
	if (!row) throw new MemlensError("Data", "The note does not exist.");
	const offset = Number(text(fields, "offset") || "0");
	if (!Number.isInteger(offset) || offset < 0)
		throw new MemlensError(
			"Usage",
			"The offset must be a whole number from 0.",
		);
	debug("Open answered", {
		event: "open",
		scope: key,
		pos: address.pos,
		offset,
	});
	return openNote(key, row, "all", offset);
}
// #endregion FUNC_openAnswer

// #region FUNC_catalogAnswer
/**
 * @purpose Give the catalog lines below one range, so the tab draws one level.
 * @invariants The start is a whole number from 0. The level is a whole number from 1 to 31.
 */
export async function catalogAnswer(request: ConsoleRequest): Promise<unknown> {
	const { memory, scope, fields } = request;
	const start = Number(text(fields, "start"));
	const level = Number(text(fields, "level") || text(fields, "budget"));
	if (
		!Number.isInteger(start) ||
		start < 0 ||
		!Number.isInteger(level) ||
		level < 1 ||
		level > 31
	)
		throw new MemlensError("Usage", "The catalog target must be a range.");
	const model = await readConsole(memory.store, memory.config, scope);
	debug("Catalog answered", { event: "catalog", start, level });
	return model.catalog.slice(start, start + 2 ** level);
}
// #endregion FUNC_catalogAnswer
