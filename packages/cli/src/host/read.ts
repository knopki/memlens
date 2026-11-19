/**
 * Console read routes.
 *
 * #region moduleContract
 * @modulecontract
 * @purpose Answer each console read over HTTP through the shared backend, so the browser shows one
 *   view without a store handle of its own.
 * @scope
 *  - The routes view, search, open, and catalog, and the host facts of the view answer.
 *  - NOT: the action route, the transport, and the read rules.
 * @usecases
 *  - View: client => asks for one scope => gets the console model
 * @dependencies USES API: @memlens/core
 * @keywords ui, view, search, open, catalog, read
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
	profileNames,
	type ScopeKey,
	type SliceLine,
} from "@memlens/core";
import type { Runtime } from "../runtime.js";
import { type Handler, type HostOptions, hostOf } from "./http.js";

// #region FUNC_viewAnswer
/** @purpose Give the console model of one scope with the host facts of the CLI. */
async function viewAnswer(
	runtime: Runtime,
	fields: Fields,
	scope: ScopeKey,
	options: HostOptions,
): Promise<
	ConsoleViewAnswer & {
		readonly profiles: string[];
		readonly path: string;
		readonly allowDelete: boolean;
	}
> {
	const model = await consoleView(hostOf(runtime), fields, scope);
	return {
		...model,
		profiles: profileNames(runtime.base, runtime.base.defaultProfile),
		path: runtime.path,
		allowDelete: options.allowDelete === true,
	};
}
// #endregion FUNC_viewAnswer

/** Each read route of the console. */
export const READ_ROUTES: Readonly<Record<string, Handler>> = {
	"/api/view": viewAnswer,
	"/api/search": (runtime, fields, scope): readonly IndexHit[] =>
		consoleSearch(hostOf(runtime), fields, scope),
	"/api/open": (runtime, fields, scope): OpenEntry | OpenChildren =>
		consoleOpen(hostOf(runtime), fields, scope),
	"/api/catalog": (runtime, fields, scope): Promise<readonly SliceLine[]> =>
		consoleCatalog(hostOf(runtime), fields, scope),
};
