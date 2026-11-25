/**
 * #region moduleContract
 * @purpose Give the standalone shell one HTTP port to the console routes, so the model holds no
 * fetch call.
 * @scope The five routes, the JSON read, and the error text. NOT: the address, the state, the
 * session, and the markup.
 * @invariants A read sends no body. An action sends a JSON object.
 * @invariants A failed answer gives the message of its error field. An answer that is not JSON gives
 * a status message.
 * @dependencies USES API: the CLI host HTTP routes
 * @keywords transport, http, port, fetch, json, error
 * #endregion moduleContract
 */

import type { IndexHit, SliceLine } from "@memlens/core";
import { fill, messages } from "../i18n.js";
import type { View } from "../types.js";
import type { OpenedTarget, StorePort, Translate } from "./console.js";

/** The English text of a broken answer, for a shell that gives no text function. */
const english: Translate = (key, values = {}) =>
	fill(messages("en")[key], values);

// #region FUNC_query
/**
 * @purpose Build the query text of one read.
 * @param fields - The fields of the read, in the order of the route.
 */
function query(fields: Record<string, string>): string {
	return new URLSearchParams(fields).toString();
}
// #endregion FUNC_query

// #region FUNC_request
/**
 * @purpose Read one answer and surface its error.
 * @invariants A read sends `cache: "no-store"`. An action sends a JSON object.
 * @invariants A body that is not JSON gives the status message. A failed answer gives the error text
 * of its body.
 */
async function request<T>(
	t: Translate,
	path: string,
	body?: unknown,
): Promise<T> {
	const response = await fetch(
		path,
		body === undefined
			? { cache: "no-store" }
			: {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				},
	);
	const text = await response.text();
	let value: unknown;
	try {
		value = text ? JSON.parse(text) : null;
	} catch {
		throw new Error(t("badJson", { status: response.status }));
	}
	if (!response.ok)
		throw new Error(
			value && typeof value === "object" && "error" in value
				? String(value.error)
				: `HTTP ${response.status}`,
		);
	return value as T;
}
// #endregion FUNC_request

// #region FUNC_createHttpPort
/**
 * @purpose Build the HTTP port of one host.
 * @param base - The route prefix of the host. The standalone host gives `/api`.
 * @param t - The text function of a broken answer. The default gives English.
 * @invariants The port keeps the paths of the CLI routes: view, search, open, catalog, and action.
 */
export function createHttpPort(
	base: string,
	t: Translate = english,
): StorePort {
	return {
		view: (fields) =>
			request<View>(
				t,
				`${base}/view?${query({
					profile: fields.profile,
					scope: fields.scope,
					kind: fields.kind,
					...(fields.screen === undefined ? {} : { screen: fields.screen }),
				})}`,
			),
		search: (fields) =>
			request<readonly IndexHit[]>(
				t,
				`${base}/search?${query({
					profile: fields.profile,
					scope: fields.scope,
					query: fields.query,
					kind: fields.kind,
					since: fields.since,
					limit: fields.limit,
				})}`,
			),
		open: (fields) =>
			request<OpenedTarget>(
				t,
				`${base}/open?${query({
					profile: fields.profile,
					scope: fields.scope,
					target: fields.target,
				})}`,
			),
		catalog: (fields) =>
			request<readonly SliceLine[]>(
				t,
				`${base}/catalog?${query({
					profile: fields.profile,
					scope: fields.scope,
					start: String(fields.start),
					level: String(fields.level),
				})}`,
			),
		action: (name, fields) =>
			request<unknown>(t, `${base}/action`, {
				...fields,
				action: name,
			}),
	};
}
// #endregion FUNC_createHttpPort
