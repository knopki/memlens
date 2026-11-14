/**
 * #region moduleContract
 * @purpose Give both shells one HTTP port to the console routes, so the model holds no fetch call.
 * @scope The five routes, the optional session field, the JSON read, and the error text. NOT: the
 * address, the state, and the markup.
 * @invariants A read sends no body. An action sends a JSON object.
 * @invariants A port with a session adds the field `session` to each request. A port without a
 * session adds no field.
 * @invariants A failed answer gives the message of its error field. An answer that is not JSON gives
 * a status message.
 * @dependencies USES API: the CLI host routes and the harness HTTP server.
 * @keywords transport, http, port, fetch, json, error
 * #endregion moduleContract
 */

import type { IndexHit } from "../../../core/src/store/types.js";
import type { SliceLine } from "../../../core/src/types/tree.js";
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

// #region FUNC_withSession
/**
 * @purpose Add the session field of the plugin host to the fields of one read.
 * @param fields - The fields of the read, in the order of the route.
 * @param session - The session id of the plugin host. The standalone host gives none.
 * @invariants A shell without a session writes no field, so the standalone URLs stay the same.
 */
function withSession(fields: Record<string, string>, session?: string): string {
	return query(session === undefined ? fields : { ...fields, session });
}
// #endregion FUNC_withSession

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
 * @param base - The route prefix: `/api` for the standalone host and `/plugins/memlens` for the
 * plugin host.
 * @param t - The text function of a broken answer. The default gives English.
 * @param session - The session id that the plugin host needs on each request. The standalone host
 * gives none.
 * @invariants The port keeps the paths of the CLI routes: view, search, open, catalog, and action.
 * @invariants The port adds the session to each request as the query field `session`, and to the
 * action request only as that field, so the action body keeps its own fields.
 */
export function createHttpPort(
	base: string,
	t: Translate = english,
	session?: string,
): StorePort {
	const suffix = session === undefined ? "" : `?${query({ session })}`;
	return {
		view: (fields) =>
			request<View>(
				t,
				`${base}/view?${withSession(
					{
						profile: fields.profile,
						scope: fields.scope,
						kind: fields.kind,
					},
					session,
				)}`,
			),
		search: (fields) =>
			request<readonly IndexHit[]>(
				t,
				`${base}/search?${withSession(
					{
						profile: fields.profile,
						scope: fields.scope,
						query: fields.query,
						kind: fields.kind,
						since: fields.since,
						limit: fields.limit,
					},
					session,
				)}`,
			),
		open: (fields) =>
			request<OpenedTarget>(
				t,
				`${base}/open?${withSession(
					{
						profile: fields.profile,
						scope: fields.scope,
						target: fields.target,
					},
					session,
				)}`,
			),
		catalog: (fields) =>
			request<readonly SliceLine[]>(
				t,
				`${base}/catalog?${withSession(
					{
						profile: fields.profile,
						scope: fields.scope,
						start: String(fields.start),
						level: String(fields.level),
					},
					session,
				)}`,
			),
		action: (name, fields) =>
			request<unknown>(t, `${base}/action${suffix}`, {
				...fields,
				action: name,
			}),
	};
}
// #endregion FUNC_createHttpPort
