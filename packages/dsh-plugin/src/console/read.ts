/**
 * #region moduleContract
 * @purpose Answer each console read of the tab through the shared backend, so a console shows one
 *   view without a store handle of its own.
 * @scope
 *  - The reads view, search, open, and catalog, the host facts of the view answer, and the field
 *    names of the Remote contract.
 *  - NOT: the action route, the transport, and the read rules.
 * @invariants The answer fields and the defaults match the standalone console.
 * @invariants The plugin host permits the delete action through the harness Remote service.
 * @usecases
 *  - View: tab => asks for one scope => gets the console model
 * @dependencies USES API: @memlens/core
 * @keywords console, view, search, open, catalog, read
 * #endregion moduleContract
 */

import {
	type ConsoleViewAnswer,
	consoleCatalog,
	consoleOpen,
	consoleSearch,
	consoleView,
	type Fields,
	type IndexHit,
	type OpenChildren,
	type OpenEntry,
	type SliceLine,
	text,
} from "@memlens/core";
import { type ConsoleRequest, hostOf } from "./scope.js";

// #region FUNC_viewAnswer
/** @purpose Give the console model of one scope with the host facts of the plugin. */
export async function viewAnswer(request: ConsoleRequest): Promise<
	ConsoleViewAnswer & {
		readonly profiles: string[];
		readonly path: string;
		readonly allowDelete: boolean;
	}
> {
	const { memory, scope, fields, profiles } = request;
	const model = await consoleView(hostOf(memory), fields, scope);
	return {
		...model,
		profiles: [...profiles],
		path: memory.config.store.path,
		allowDelete: true,
	};
}
// #endregion FUNC_viewAnswer

// #region FUNC_searchAnswer
/** @purpose Answer one search with the field names of the Remote contract. */
export function searchAnswer(request: ConsoleRequest): readonly IndexHit[] {
	const { memory, scope } = request;
	return consoleSearch(hostOf(memory), alias(request.fields), scope);
}
// #endregion FUNC_searchAnswer

// #region FUNC_openAnswer
/** @purpose Answer one open request with the field names of the Remote contract. */
export function openAnswer(request: ConsoleRequest): OpenEntry | OpenChildren {
	const { memory, scope } = request;
	return consoleOpen(hostOf(memory), alias(request.fields), scope);
}
// #endregion FUNC_openAnswer

// #region FUNC_catalogAnswer
/** @purpose Answer one catalog request with the field names of the Remote contract. */
export async function catalogAnswer(
	request: ConsoleRequest,
): Promise<readonly SliceLine[]> {
	const { memory, scope } = request;
	return consoleCatalog(hostOf(memory), alias(request.fields), scope);
}
// #endregion FUNC_catalogAnswer

// #region FUNC_alias
/** @purpose Map the field names of the Remote contract to the shared names. */
function alias(fields: Fields): Fields {
	const next = { ...fields };
	if (next.query === undefined && typeof next.q === "string")
		next.query = next.q;
	if (next.level === undefined && typeof next.budget === "string")
		next.level = next.budget;
	return next;
}
// #endregion FUNC_alias
